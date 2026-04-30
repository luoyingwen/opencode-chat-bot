import { config } from "../config.js";
import { initFeishuClient, getFeishuClient } from "./client.js";
import {
  setFeishuClient,
  setFeishuActive,
  clearFeishuActive,
  installFeishuEventRouting,
  getActiveChatId,
  handleFeishuPermissionReply,
  hasFeishuPendingPermission,
} from "./events.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../session/manager.js";
import { ingestSessionInfoForCache } from "../session/cache-manager.js";
import { getCurrentProject, setCurrentProject } from "../settings/manager.js";
import { getProjects, ensureProjectByPath } from "../project/manager.js";
import {
  getStoredAgent,
  fetchCurrentAgent,
  getAvailableAgents,
  selectAgent,
} from "../agent/manager.js";
import { getAgentDisplayName } from "../agent/types.js";
import { fetchCurrentModel, getStoredModel } from "../model/manager.js";
import { formatModelForDisplay } from "../model/types.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { subscribeToEvents, stopEventListening } from "../opencode/events.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { formatErrorDetails } from "../utils/error-format.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { interactionManager } from "../interaction/manager.js";
import { renameManager } from "../rename/manager.js";
import { processManager } from "../process/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { handleTaskCommand, handleTaskTextInput, isUserInTaskFlow } from "./task.js";
import {
  handleTaskListCommand,
  handleTaskListTextInput,
  isUserInTaskListFlow,
} from "./tasklist.js";
import { setFeishuNotificationCallback } from "../scheduled-task/runtime.js";
import { initUserChatStore, storeUserChatMapping, getChatIdForUser } from "./user-chat-store.js";
import { exitApplication } from "../app/exit-app.js";
import { handleCommandsCommand, handleCommandByIndex } from "./commands.js";
import { isAutoConfirmEnabled, setAutoConfirm } from "../permission/auto-confirm.js";

function isUserAllowed(userId: string): boolean {
  const allowed = config.feishu.allowedUsers;
  if (!allowed) return true;
  const allowedList = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedList.length === 0) return true;
  return allowedList.includes(userId);
}

async function ensureEventSubscription(directory: string): Promise<void> {
  if (!directory) {
    logger.error("[Feishu] No directory found for event subscription");
    return;
  }

  logger.info(`[Feishu] Subscribing to OpenCode events for project: ${directory}`);
  void subscribeToEvents(directory, (event) => {
    if (event.type === "session.created" || event.type === "session.updated") {
      const info = (
        event.properties as { info?: { directory?: string; time?: { updated?: number } } }
      ).info;

      if (info?.directory) {
        safeBackgroundTask({
          taskName: `session.cache.${event.type}`,
          task: () => ingestSessionInfoForCache(info),
        });
      }
    }

    summaryAggregator.processEvent(event);
  });

  logger.debug("[Feishu] Event subscription initiated (running in background)");
}

async function sendFeishuMessage(chatId: string, userId: string, text: string): Promise<void> {
  try {
    const client = getFeishuClient();
    const result = await client.sendMarkdownMessage(chatId, text);
    if (!result.ok) {
      logger.error(`[Feishu] Failed to send message: ${result.error}`);
    }
  } catch (err) {
    logger.error("[Feishu] Failed to send message:", err);
  }
}

async function handleStatusCommand(chatId: string, userId: string): Promise<void> {
  try {
    const { data, error } = await opencodeClient.global.health();

    if (error || !data) {
      await sendFeishuMessage(chatId, userId, "❌ OpenCode server is unavailable.");
      return;
    }

    const healthLabel = data.healthy ? "✅ Healthy" : "❌ Unhealthy";
    const lines: string[] = [];
    lines.push("# OpenCode Status");
    lines.push("");
    lines.push(`**Health:** ${healthLabel}`);

    if (data.version) {
      lines.push(`**Version:** \`${data.version}\``);
    }

    if (processManager.isRunning()) {
      const uptime = processManager.getUptime();
      const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
      lines.push(
        `**Process:** managed (PID ${processManager.getPID() ?? "-"}, uptime ${uptimeStr}s)`,
      );
    }

    const currentAgent = await fetchCurrentAgent();
    if (currentAgent) {
      lines.push(`**Agent:** ${getAgentDisplayName(currentAgent)}`);
    }

    const currentModel = fetchCurrentModel();
    lines.push(
      `**Model:** ${formatModelForDisplay(currentModel.providerID, currentModel.modelID)}`,
    );

    const currentProject = getCurrentProject();
    lines.push("");
    if (currentProject) {
      lines.push(`**Project:** ${currentProject.name || currentProject.worktree}`);
    } else {
      lines.push("No project selected. Use `/projects` to choose one.");
    }

    const currentSession = getCurrentSession();
    if (currentSession) {
      lines.push(`**Session:** ${currentSession.title}`);
      // Add auto-confirm status for current session
      const autoConfirmStatus = isAutoConfirmEnabled(currentSession.id);
      lines.push(`**Auto_confirm:** ${autoConfirmStatus ? "✅ ON" : "❌ OFF"}`);
    } else {
      lines.push("No active session. Send a message to create one.");
    }

    // Join with double newlines for proper Markdown line breaks
    const message = lines.join("\n\n");
    await sendFeishuMessage(chatId, userId, message);
  } catch (err) {
    logger.error("[Feishu] Error in status command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to fetch status.");
  }
}

async function handleNewCommand(chatId: string, userId: string): Promise<void> {
  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendFeishuMessage(chatId, userId, t("new.project_not_selected"));
      return;
    }

    const { data: session, error } = await opencodeClient.session.create({
      directory: currentProject.worktree,
    });

    if (error || !session) {
      await sendFeishuMessage(chatId, userId, "❌ Failed to create session.");
      return;
    }

    logger.info(`[Feishu] Created new session: id=${session.id}, title="${session.title}"`);

    setCurrentSession({
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    });

    summaryAggregator.clear();
    clearAllInteractionState("feishu_session_created");
    await ingestSessionInfoForCache(session);

    await sendFeishuMessage(chatId, userId, `✅ New session created: **${session.title}**`);
  } catch (err) {
    logger.error("[Feishu] Error in new command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to create session.");
  }
}

async function handleStopCommand(chatId: string, userId: string): Promise<void> {
  try {
    clearFeishuActive();
    stopEventListening();
    summaryAggregator.clear();
    clearAllInteractionState("feishu_stop_command");

    const client = getFeishuClient();
    const activeChatId = getActiveChatId();
    if (activeChatId && client.hasActiveCard(activeChatId)) {
      client.cleanupCard(activeChatId);
    }

    const currentSession = getCurrentSession();
    if (!currentSession) {
      await sendFeishuMessage(chatId, userId, t("stop.no_active_session"));
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: abortError } = await (opencodeClient.session.abort as any)(
        {
          sessionID: currentSession.id,
          directory: currentSession.directory,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { signal: controller.signal } as any,
      );

      clearTimeout(timeoutId);

      if (abortError) {
        logger.warn("[Feishu] Abort request failed:", abortError);
        await sendFeishuMessage(
          chatId,
          userId,
          "⚠️ Stop signal sent, but server did not confirm abort.",
        );
        return;
      }

      await sendFeishuMessage(chatId, userId, "✅ Session stopped.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        await sendFeishuMessage(
          chatId,
          userId,
          "⚠️ Stop request timed out. The session may still be running.",
        );
      } else {
        throw err;
      }
    }
  } catch (err) {
    logger.error("[Feishu] Error in stop command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to stop session.");
  }
}

async function handleProjectsCommand(chatId: string, userId: string): Promise<void> {
  try {
    const projects = await getProjects();

    if (projects.length === 0) {
      await sendFeishuMessage(
        chatId,
        userId,
        "No projects found. Make sure OpenCode server is running.",
      );
      return;
    }

    const currentProject = getCurrentProject();
    const limit = config.bot.projectsListLimit;
    const displayed = projects.slice(0, limit);

    let message = `# Projects (${displayed.length}/${projects.length})\n\n`;
    for (let i = 0; i < displayed.length; i++) {
      const project = displayed[i];
      const isActive = currentProject?.worktree === project.worktree;
      const marker = isActive ? " ✅" : "";
      message += `${i + 1}. **${project.name || project.worktree}**${marker}\n   \`${project.worktree}\`\n`;
    }

    message += "\nUse `/project <number>` to select a project.";

    await sendFeishuMessage(chatId, userId, message);
  } catch (err) {
    logger.error("[Feishu] Error in projects command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to load projects.");
  }
}

async function handleProjectCommand(chatId: string, userId: string, arg: string): Promise<void> {
  const trimmedArg = arg.trim();

  if (!trimmedArg) {
    await sendFeishuMessage(
      chatId,
      userId,
      "❌ Please provide a project number or path. Use `/projects` to see the list or provide an absolute path.",
    );
    return;
  }

  const index = parseInt(trimmedArg, 10);

  // Case 1: It's a number - use existing logic
  if (!isNaN(index) && index >= 1) {
    try {
      const projects = await getProjects();

      if (index > projects.length) {
        await sendFeishuMessage(
          chatId,
          userId,
          `❌ Project #${index} not found. Only ${projects.length} projects available.`,
        );
        return;
      }

      const selected = projects[index - 1];

      setCurrentProject({
        id: selected.id,
        worktree: selected.worktree,
        name: selected.name || selected.worktree,
      });

      summaryAggregator.clear();
      clearAllInteractionState("feishu_project_switch");

      await sendFeishuMessage(
        chatId,
        userId,
        `✅ Project selected: **${selected.name || selected.worktree}**\n\`${selected.worktree}\``,
      );

      logger.info(`[Feishu] Project selected by index: ${selected.name || selected.worktree}`);
    } catch (err) {
      logger.error("[Feishu] Error in project command:", err);
      await sendFeishuMessage(chatId, userId, "❌ Failed to select project.");
    }
    return;
  }

  // Case 2: It's a path - use new logic
  try {
    logger.info(`[Feishu] Attempting to select project by path: ${trimmedArg}`);

    const { project, isNew, pathCreated } = await ensureProjectByPath(trimmedArg);

    setCurrentProject({
      id: project.id,
      worktree: project.worktree,
      name: project.name || project.worktree,
    });

    summaryAggregator.clear();
    clearAllInteractionState("feishu_project_switch");

    // Build success message
    let message = "";
    if (isNew) {
      message = `✅ **New project created and selected**\n\n`;
      if (pathCreated) {
        message += `📁 Directory created: \`${project.worktree}\`\n`;
      } else {
        message += `📁 Directory: \`${project.worktree}\`\n`;
      }
      message += `📝 Project: **${project.name || project.worktree}**`;
    } else {
      message = `✅ **Project selected**\n\n`;
      if (pathCreated) {
        message += `📁 Directory created: \`${project.worktree}\`\n`;
      }
      message += `📝 Project: **${project.name || project.worktree}**\n`;
      message += `\`${project.worktree}\``;
    }

    await sendFeishuMessage(chatId, userId, message);

    logger.info(
      `[Feishu] Project selected by path: ${project.worktree} (isNew: ${isNew}, pathCreated: ${pathCreated})`,
    );
  } catch (err) {
    logger.error("[Feishu] Error selecting project by path:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    await sendFeishuMessage(
      chatId,
      userId,
      `❌ Failed to select project:\n\`\`\`\n${errorMessage}\n\`\`\``,
    );
  }
}

async function handleSessionsCommand(chatId: string, userId: string): Promise<void> {
  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendFeishuMessage(chatId, userId, "❌ No project selected. Use `/projects` first.");
      return;
    }

    const { data: sessions, error } = await opencodeClient.session.list({
      directory: currentProject.worktree,
    });

    if (error || !sessions) {
      await sendFeishuMessage(chatId, userId, "❌ Failed to load sessions.");
      return;
    }

    if (sessions.length === 0) {
      await sendFeishuMessage(chatId, userId, "No sessions found. Send a message to create one.");
      return;
    }

    const limit = config.bot.sessionsListLimit;
    const sorted = [...sessions].sort((a, b) => {
      const timeA = a.time?.updated ?? a.time?.created ?? 0;
      const timeB = b.time?.updated ?? b.time?.created ?? 0;
      return timeB - timeA;
    });
    const displayed = sorted.slice(0, limit);
    const currentSession = getCurrentSession();

    let message = `# Sessions (${displayed.length}/${sessions.length})\n\n`;
    for (let i = 0; i < displayed.length; i++) {
      const session = displayed[i];
      const isActive = currentSession?.id === session.id;
      const marker = isActive ? " ✅" : "";
      message += `${i + 1}. **${session.title || session.id}**${marker}\n`;
    }

    if (sessions.length > limit) {
      message += `\n_…and ${sessions.length - limit} more_`;
    }

    message += "\n\nUse `/session <number>` to select a session.";

    await sendFeishuMessage(chatId, userId, message);
  } catch (err) {
    logger.error("[Feishu] Error in sessions command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to load sessions.");
  }
}

async function handleSessionCommand(chatId: string, userId: string, arg: string): Promise<void> {
  const index = parseInt(arg, 10);
  if (isNaN(index) || index < 1) {
    await sendFeishuMessage(
      chatId,
      userId,
      "❌ Please provide a valid session number. Use `/sessions` to see the list.",
    );
    return;
  }

  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendFeishuMessage(chatId, userId, "❌ No project selected. Use `/projects` first.");
      return;
    }

    const { data: sessions, error } = await opencodeClient.session.list({
      directory: currentProject.worktree,
    });

    if (error || !sessions) {
      await sendFeishuMessage(chatId, userId, "❌ Failed to load sessions.");
      return;
    }

    const sorted = [...sessions].sort((a, b) => {
      const timeA = a.time?.updated ?? a.time?.created ?? 0;
      const timeB = b.time?.updated ?? b.time?.created ?? 0;
      return timeB - timeA;
    });

    if (index > sorted.length) {
      await sendFeishuMessage(
        chatId,
        userId,
        `❌ Session #${index} not found. Only ${sorted.length} sessions available.`,
      );
      return;
    }

    const selected = sorted[index - 1];

    const { data: session, error: sessionError } = await opencodeClient.session.get({
      sessionID: selected.id,
      directory: currentProject.worktree,
    });

    if (sessionError || !session) {
      await sendFeishuMessage(chatId, userId, "❌ Failed to get session details.");
      return;
    }

    logger.info(
      `[Feishu] Session selected: id=${session.id}, title="${session.title}", project=${currentProject.worktree}`,
    );

    const sessionInfo = {
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    };

    setCurrentSession(sessionInfo);
    summaryAggregator.clear();
    clearAllInteractionState("feishu_session_switch");

    await sendFeishuMessage(chatId, userId, `✅ Session selected: **${session.title}**`);

    logger.info(`[Feishu] Session selected: ${session.title}`);
  } catch (err) {
    logger.error("[Feishu] Error in session command:", err);
    await sendFeishuMessage(chatId, userId, "❌ Failed to select session.");
  }
}

async function handleRenameCommand(chatId: string, userId: string): Promise<void> {
  try {
    const currentSession = getCurrentSession();
    if (!currentSession) {
      await sendFeishuMessage(chatId, userId, t("rename.no_session"));
      return;
    }

    // Start rename flow and set up state management
    renameManager.startWaiting(currentSession.id, currentSession.directory, currentSession.title);
    interactionManager.start({
      kind: "rename",
      expectedInput: "text",
      metadata: {
        sessionId: currentSession.id,
        userId: userId,
      },
    });

    // Send prompt message with abort hint
    const message =
      t("rename.prompt", { title: currentSession.title }) + "\n\n" + "💡 " + t("rename.hint_abort");
    await sendFeishuMessage(chatId, userId, message);

    logger.info(`[Feishu] Waiting for new title for session: ${currentSession.id}`);
  } catch (err) {
    logger.error("[Feishu] Error in rename command:", err);
    await sendFeishuMessage(chatId, userId, t("rename.error"));
  }
}

async function handleHelpCommand(chatId: string, userId: string): Promise<void> {
  const commands = getLocalizedBotCommandsFeishu();
  const lines = commands.map((item) => `/${item.command} - ${item.description}`);
  const message = `📖 **Commands**\n\n${lines.join("\n\n")}\n\n_Tip: Use \`/projects\` and \`/project <number>\` to select a project, then \`/sessions\` and \`/session <number>\` to select a session._`;
  await sendFeishuMessage(chatId, userId, message);
}

async function handleAgentListCommand(chatId: string, userId: string): Promise<void> {
  try {
    const agents = await getAvailableAgents();

    if (agents.length === 0) {
      await sendFeishuMessage(chatId, userId, t("agent.list.empty"));
      return;
    }

    const currentAgent = getStoredAgent();
    const list = agents
      .map((agent, index) => {
        const marker = agent.name === currentAgent ? " ✅" : "";
        return `${index + 1}. ${getAgentDisplayName(agent.name)}${marker}`;
      })
      .join("\n");

    const message = t("agent.list.title", {
      current: getAgentDisplayName(currentAgent),
      list,
    });

    await sendFeishuMessage(chatId, userId, message);
  } catch (err) {
    logger.error("[Feishu] Error listing agents:", err);
    await sendFeishuMessage(chatId, userId, t("error.load_agents"));
  }
}

async function handleAgentSwitchCommand(
  chatId: string,
  userId: string,
  arg: string,
): Promise<void> {
  const index = parseInt(arg, 10);

  if (isNaN(index) || index < 1) {
    await sendFeishuMessage(chatId, userId, t("agent.switch.invalid_index"));
    return;
  }

  try {
    const agents = await getAvailableAgents();

    if (index > agents.length) {
      await sendFeishuMessage(chatId, userId, t("agent.switch.invalid_index"));
      return;
    }

    const selectedAgent = agents[index - 1];
    selectAgent(selectedAgent.name);

    await sendFeishuMessage(
      chatId,
      userId,
      t("agent.switch.success", { name: getAgentDisplayName(selectedAgent.name) }),
    );
  } catch (err) {
    logger.error("[Feishu] Error switching agent:", err);
    await sendFeishuMessage(chatId, userId, t("agent.switch.error"));
  }
}

async function handleExitCommand(chatId: string, userId: string): Promise<void> {
  await sendFeishuMessage(chatId, userId, t("exit.stopping"));
  await exitApplication("feishu:/exit");
}

function getLocalizedBotCommandsFeishu(): { command: string; description: string }[] {
  return [
    { command: "status", description: t("cmd.description.status") },
    { command: "new", description: t("cmd.description.new") },
    { command: "stop", description: t("cmd.description.stop") },
    { command: "sessions", description: t("cmd.description.sessions") },
    { command: "session <number>", description: "Select a session by number" },
    { command: "projects", description: t("cmd.description.projects") },
    { command: "project <number>", description: "Select a project by number" },
    { command: "agents", description: t("cmd.description.agents") },
    { command: "agent <number>", description: t("cmd.description.agent_number") },
    { command: "commands", description: t("cmd.description.commands") },
    { command: "command <number>", description: "Execute a command by number" },
    {
      command: "auto_confirm [on|off]",
      description: "Toggle auto-confirmation for current session",
    },
    { command: "rename", description: t("cmd.description.rename") },
    { command: "task", description: t("cmd.description.task") },
    { command: "tasks", description: t("cmd.description.tasks") },
    { command: "exit", description: t("cmd.description.exit") },
    { command: "help", description: t("cmd.description.help") },
  ];
}

function getValidCommands(): string[] {
  return [
    "status",
    "new",
    "stop",
    "sessions",
    "session",
    "projects",
    "project",
    "agents",
    "agent",
    "commands",
    "command",
    "auto_confirm",
    "rename",
    "task",
    "tasks",
    "exit",
    "help",
  ];
}

async function handleTextMessage(chatId: string, userId: string, text: string): Promise<void> {
  logger.info(
    `[Feishu] handleTextMessage called: userId=${userId}, text="${text.substring(0, 50)}..."`,
  );

  if (isUserInTaskFlow(userId)) {
    const response = await handleTaskTextInput(userId, text);
    if (response !== null) {
      await sendFeishuMessage(chatId, userId, response);
      return;
    }
  }

  if (isUserInTaskListFlow(userId)) {
    const response = await handleTaskListTextInput(userId, text);
    if (response !== null) {
      await sendFeishuMessage(chatId, userId, response);
      return;
    }
  }

  // Check if user is in rename flow
  if (renameManager.isWaitingForName()) {
    const sessionInfo = renameManager.getSessionInfo();
    if (sessionInfo) {
      const newTitle = text.trim();
      if (!newTitle) {
        await sendFeishuMessage(chatId, userId, t("rename.empty_title"));
        return;
      }

      logger.info(`[Feishu] Renaming session ${sessionInfo.sessionId} to: ${newTitle}`);

      try {
        const { data: updatedSession, error } = await opencodeClient.session.update({
          sessionID: sessionInfo.sessionId,
          directory: sessionInfo.directory,
          title: newTitle,
        });

        if (error || !updatedSession) {
          throw error || new Error("Failed to update session");
        }

        setCurrentSession({
          id: sessionInfo.sessionId,
          title: newTitle,
          directory: sessionInfo.directory,
        });

        await sendFeishuMessage(chatId, userId, t("rename.success", { title: newTitle }));
        logger.info(`[Feishu] Session renamed successfully: ${newTitle}`);
      } catch (err) {
        logger.error("[Feishu] Error renaming session:", err);
        await sendFeishuMessage(chatId, userId, t("rename.error"));
      }

      renameManager.clear();
      if (interactionManager.getSnapshot()?.kind === "rename") {
        interactionManager.clear("rename_completed");
      }
      return;
    }
  }

  try {
    const currentProject = getCurrentProject();
    logger.debug(`[Feishu] Current project: ${currentProject ? currentProject.worktree : "null"}`);

    if (!currentProject) {
      logger.warn(`[Feishu] No project selected for user ${userId}`);
      await sendFeishuMessage(
        chatId,
        userId,
        "❌ No project selected. Use `/projects` and `/project <number>` first.",
      );
      return;
    }

    let currentSession = getCurrentSession();

    if (!currentSession || currentSession.directory !== currentProject.worktree) {
      if (currentSession && currentSession.directory !== currentProject.worktree) {
        logger.warn(`[Feishu] Session/project mismatch. Clearing session context.`);
        stopEventListening();
        summaryAggregator.clear();
        clearAllInteractionState("feishu_session_mismatch");
      }

      const { data: session, error } = await opencodeClient.session.create({
        directory: currentProject.worktree,
      });

      if (error || !session) {
        logger.error(`[Feishu] Failed to create session: ${error || "no session data"}`);
        await sendFeishuMessage(chatId, userId, "❌ Failed to create session.");
        return;
      }

      logger.info(`[Feishu] Auto-created session: id=${session.id}, title="${session.title}"`);

      currentSession = {
        id: session.id,
        title: session.title,
        directory: currentProject.worktree,
      };

      setCurrentSession(currentSession);
      await ingestSessionInfoForCache(session);
      await sendFeishuMessage(chatId, userId, `📝 New session: **${session.title}**`);
    }

    try {
      const { data: statusData } = await opencodeClient.session.status({
        directory: currentSession.directory,
      });

      if (statusData) {
        const sessionStatus = (statusData as Record<string, { type?: string }>)[currentSession.id];
        if (sessionStatus?.type === "busy") {
          await sendFeishuMessage(
            chatId,
            userId,
            "⏳ Session is busy. Please wait for the current task to finish, or use `/stop`.",
          );
          return;
        }
      }
    } catch (err) {
      logger.warn("[Feishu] Failed to check session status:", err);
    }

    await ensureEventSubscription(currentSession.directory);
    logger.debug(`[Feishu] Event subscription completed for ${currentSession.directory}`);

    installFeishuEventRouting();
    summaryAggregator.setSession(currentSession.id);

    setFeishuActive(userId, chatId);

    const client = getFeishuClient();
    const lastMsgId = client.getLastIncomingMessageId(chatId);
    if (lastMsgId) {
      await client.addTypingReaction(lastMsgId);
    }

    const currentAgent = getStoredAgent();
    const storedModel = getStoredModel();

    const promptOptions: {
      sessionID: string;
      directory: string;
      parts: Array<{ type: "text"; text: string }>;
      model?: { providerID: string; modelID: string };
      agent?: string;
      variant?: string;
    } = {
      sessionID: currentSession.id,
      directory: currentSession.directory,
      parts: [{ type: "text", text }],
      agent: currentAgent,
    };

    if (storedModel.providerID && storedModel.modelID) {
      promptOptions.model = {
        providerID: storedModel.providerID,
        modelID: storedModel.modelID,
      };

      if (storedModel.variant) {
        promptOptions.variant = storedModel.variant;
      }
    }

    logger.info(
      `[Feishu] Sending prompt (fire-and-forget): agent=${currentAgent}, session=${currentSession.id}, text="${text.substring(0, 50)}..."`,
    );

    safeBackgroundTask({
      taskName: "feishu.session.prompt",
      task: () => {
        logger.debug(`[Feishu] Executing session.prompt in background task`);
        return opencodeClient.session.prompt(promptOptions);
      },
      onSuccess: ({ error }) => {
        logger.debug(`[Feishu] session.prompt onSuccess called, error=${error ? "yes" : "no"}`);
        if (error) {
          const details = formatErrorDetails(error, 1500);
          logger.error("[Feishu] session.prompt API error:", details);
          void sendFeishuMessage(
            chatId,
            userId,
            `❌ Failed to send prompt.\n\nError details:\n\`\`\`\n${details}\n\`\`\``,
          );
          return;
        }
        logger.info("[Feishu] session.prompt completed successfully");
      },
      onError: (error) => {
        const details = formatErrorDetails(error, 1500);

        // Check if it's a network/connection termination error
        const isTerminatedError =
          error instanceof Error &&
          (error.message?.includes("terminated") ||
            error.message?.includes("Connection") ||
            error.message?.includes("aborted"));

        if (isTerminatedError) {
          logger.warn("[Feishu] session.prompt connection terminated (network issue):", details);
          // Don't send error to user - SSE might still receive events
          return;
        }

        logger.error("[Feishu] session.prompt background failure:", details);
        void sendFeishuMessage(
          chatId,
          userId,
          `❌ Prompt failed.\n\nError details:\n\`\`\`\n${details}\n\`\`\``,
        );
        clearFeishuActive();
      },
    });
    logger.debug(`[Feishu] safeBackgroundTask for session.prompt dispatched`);
  } catch (err) {
    logger.error("[Feishu] Error processing message:", err);
    await sendFeishuMessage(chatId, userId, "❌ An error occurred. Please try again.");
    clearFeishuActive();
  }
}

function processMessage(userId: string, chatId: string, text: string, _messageId: string): void {
  if (!isUserAllowed(userId)) {
    logger.warn(`[Feishu] Message from unauthorized user: ${userId}`);
    return;
  }

  const client = getFeishuClient();
  client.getLastIncomingMessageId(chatId);

  // Handle permission replies (/1, /2, /3) first
  if (text === "/1" || text === "/2" || text === "/3") {
    if (hasFeishuPendingPermission(userId)) {
      const replyMap: Record<string, "once" | "always" | "reject"> = {
        "/1": "once",
        "/2": "always",
        "/3": "reject",
      };
      const reply = replyMap[text];
      const handled = handleFeishuPermissionReply(userId, chatId, reply);
      if (handled) {
        return;
      }
    }
    // No pending permission, treat as unknown command
    void sendFeishuMessage(chatId, userId, "⚠️ No pending permission request.");
    return;
  }

  // Validate slash commands
  if (text.startsWith("/")) {
    const validCommands = getValidCommands();
    const commandName = text.slice(1).split(/\s+/)[0]; // Extract command name after /

    if (!validCommands.includes(commandName)) {
      // Unknown command - show error with available commands
      const commands = getLocalizedBotCommandsFeishu();
      const lines = commands.map((item) => `/${item.command} - ${item.description}`);
      const message = `⚠️ **Unknown command**: /${commandName}\n\n**Available commands:**\n\n${lines.join("\n\n")}\n\n_Use /help for more details._`;
      void sendFeishuMessage(chatId, userId, message);
      return;
    }
  }

  if (text.startsWith("/status")) {
    void handleStatusCommand(chatId, userId);
  } else if (text.startsWith("/new")) {
    void handleNewCommand(chatId, userId);
  } else if (text.startsWith("/stop")) {
    void handleStopCommand(chatId, userId);
  } else if (text.startsWith("/projects")) {
    void handleProjectsCommand(chatId, userId);
  } else if (text.startsWith("/project ")) {
    const arg = text.slice(9).trim();
    void handleProjectCommand(chatId, userId, arg);
  } else if (text.startsWith("/sessions")) {
    void handleSessionsCommand(chatId, userId);
  } else if (text.startsWith("/session ")) {
    const arg = text.slice(9).trim();
    void handleSessionCommand(chatId, userId, arg);
  } else if (text.startsWith("/rename")) {
    void handleRenameCommand(chatId, userId);
  } else if (text === "/agents") {
    void handleAgentListCommand(chatId, userId);
  } else if (text.startsWith("/agent ")) {
    const arg = text.slice(7).trim();
    void handleAgentSwitchCommand(chatId, userId, arg);
  } else if (text.startsWith("/tasks")) {
    void (async () => {
      const message = await handleTaskListCommand(userId);
      await sendFeishuMessage(chatId, userId, message);
    })();
  } else if (text.startsWith("/task")) {
    void (async () => {
      const message = await handleTaskCommand(userId);
      await sendFeishuMessage(chatId, userId, message);
    })();
  } else if (text.startsWith("/commands")) {
    void (async () => {
      const message = await handleCommandsCommand(chatId, userId);
      await sendFeishuMessage(chatId, userId, message);
    })();
  } else if (text.startsWith("/command ")) {
    const args = text.slice(9).trim();
    const parts = args.split(/\s+/, 2);
    const index = parts[0];
    const commandArgs = parts[1] || "";
    void (async () => {
      const message = await handleCommandByIndex(chatId, userId, index, commandArgs);
      await sendFeishuMessage(chatId, userId, message);
    })();
  } else if (text.startsWith("/auto_confirm")) {
    const arg = text.slice(13).trim();
    const currentSession = getCurrentSession();

    if (!currentSession) {
      void sendFeishuMessage(chatId, userId, "❌ No active session");
    } else if (arg === "on") {
      setAutoConfirm(currentSession.id, true);
      void sendFeishuMessage(chatId, userId, "✅ Auto_confirm enabled");
    } else if (arg === "off") {
      setAutoConfirm(currentSession.id, false);
      void sendFeishuMessage(chatId, userId, "✅ Auto_confirm disabled");
    } else {
      const status = isAutoConfirmEnabled(currentSession.id);
      void sendFeishuMessage(chatId, userId, `Auto_confirm status: ${status ? "ON" : "OFF"}`);
    }
  } else if (text.startsWith("/exit")) {
    void handleExitCommand(chatId, userId);
  } else if (text.startsWith("/help") || text === "help" || text === "帮助" || text === "/帮助") {
    void handleHelpCommand(chatId, userId);
  } else {
    logger.info(
      `[Feishu] Routing to handleTextMessage: userId=${userId}, chatId=${chatId}, text="${text.substring(0, 30)}..."`,
    );
    void handleTextMessage(chatId, userId, text);
  }
}

export async function initializeFeishuHandler(): Promise<void> {
  const { appId, appSecret, domain } = config.feishu;

  if (!appId || !appSecret) {
    throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required for Feishu integration");
  }

  // Initialize user-chat store from persistent settings
  await initUserChatStore();

  const client = initFeishuClient({ appId, appSecret, domain });
  setFeishuClient(client);

  // Enhanced notification callback that uses stored user-chat mappings
  setFeishuNotificationCallback(async (text: string, targetUserId?: string) => {
    // Try to find target user
    const allowedUsers = config.feishu.allowedUsers
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    // If specific user requested, try that first
    let userId = targetUserId;
    if (!userId && allowedUsers.length > 0) {
      userId = allowedUsers[0];
    }

    if (!userId) {
      logger.warn("[Feishu Task Notification] No target user configured, cannot send notification");
      return;
    }

    // Try to get chatId from stored mapping
    let chatId = getChatIdForUser(userId);

    // Fallback to active chat if available
    if (!chatId) {
      chatId = getActiveChatId();
    }

    if (!chatId) {
      logger.warn(
        `[Feishu Task Notification] No chat mapping for user ${userId}. User needs to send a message first.`,
      );
      return;
    }

    await sendFeishuMessage(chatId, userId, text);
    logger.info(
      `[Feishu Task Notification] Sent scheduled task update to user ${userId}, chat ${chatId}`,
    );
  });

  client.onMessage((data) => {
    // Store user-chat mapping when receiving a message
    void storeUserChatMapping(data.userId, data.chatId);
    processMessage(data.userId, data.chatId, data.text, data.messageId);
  });

  try {
    await client.connect();
    logger.info("[Feishu] Stream mode connected successfully");
  } catch (err) {
    logger.error("[Feishu] Failed to connect stream:", err);
    // Don't throw - the underlying SDK will retry
  }
}

export async function sendFeishuStartupMessage(): Promise<void> {
  // Feishu doesn't have a direct message API without session context
  // Wait for user to send first message
  logger.info("[Feishu] Bot started. Waiting for user messages...");
}
