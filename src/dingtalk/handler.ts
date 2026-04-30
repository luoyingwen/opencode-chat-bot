import { config } from "../config.js";
import {
  initDingTalkClient,
  getDingTalkClient,
  formatDingTalkNetworkError,
} from "./client.js";
import {
  setDingTalkClient,
  setDingTalkActive,
  clearDingTalkActive,
  installDingTalkEventRouting,
  setUserSessionWebhook,
  getUserSessionWebhook,
  handleDingTalkPermissionReply,
  hasDingTalkPendingPermission,
} from "./events.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../session/manager.js";
import { ingestSessionInfoForCache } from "../session/cache-manager.js";
import { getCurrentProject, setCurrentProject } from "../settings/manager.js";
import { getProjects, ensureProjectByPath } from "../project/manager.js";
import { getStoredAgent } from "../agent/manager.js";
import { getAvailableAgents, selectAgent } from "../agent/manager.js";
import { getStoredModel } from "../model/manager.js";
import { fetchCurrentAgent } from "../agent/manager.js";
import { getAgentDisplayName } from "../agent/types.js";
import { fetchCurrentModel } from "../model/manager.js";
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
import { exitApplication } from "../app/exit-app.js";
import { handleTaskCommand, handleTaskTextInput, isUserInTaskFlow } from "./task.js";
import {
  handleTaskListCommand,
  handleTaskListTextInput,
  isUserInTaskListFlow,
} from "./tasklist.js";
import { setDingTalkNotificationCallback } from "../scheduled-task/runtime.js";
import { handleCommandsCommand, handleCommandByIndex } from "./commands.js";
import { isAutoConfirmEnabled, setAutoConfirm } from "../permission/auto-confirm.js";

function isUserAllowed(userId: string): boolean {
  const allowed = config.dingtalk.allowedUserId;
  if (!allowed) return true;
  return userId === allowed;
}

async function ensureEventSubscription(directory: string): Promise<void> {
  if (!directory) {
    logger.error("[DingTalk] No directory found for event subscription");
    return;
  }

  logger.info(`[DingTalk] Subscribing to OpenCode events for project: ${directory}`);
  // subscribeToEvents runs indefinitely in a loop, so we don't await it
  // It will keep listening for SSE events in the background
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

  logger.debug("[DingTalk] Event subscription initiated (running in background)");
}

async function sendDingTalkMessage(userId: string, text: string): Promise<void> {
  const client = getDingTalkClient();
  const sessionWebhook = getUserSessionWebhook(userId);

  if (sessionWebhook) {
    try {
      await client.sendMarkdownMessage(sessionWebhook, userId, "OpenCode", text);
      logger.info(`[DingTalk] Command response sent via webhook to user ${userId}`);
      return;
    } catch (err) {
      const details = formatDingTalkNetworkError(err);

      if (
        details.includes("400502") ||
        details.includes("400014") ||
        details.includes("session") ||
        details.includes("webhook") ||
        details.includes("expired") ||
        details.includes("invalid")
      ) {
        logger.warn(
          `[DingTalk] Webhook expired for user ${userId}, falling back to proactive API...`,
        );
        setUserSessionWebhook(userId, "");
      } else {
        logger.error(`[DingTalk] Failed to send via webhook:\n${details}`);
      }
    }
  }

  if (client.hasProactiveRisk(userId)) {
    logger.warn(
      `[DingTalk] Skipping proactive send to ${userId} due to recent permission error`,
    );
    return;
  }

  logger.info(`[DingTalk] Using proactive API to send command response to user ${userId}`);
  const result = await client.sendProactiveMarkdownMessage(userId, "OpenCode", text);

  if (!result.ok) {
    logger.error(`[DingTalk] Proactive command response failed: ${result.error}`);
  } else {
    logger.info(`[DingTalk] Command response sent via proactive API to user ${userId}`);
  }
}

async function handleStatusCommand(userId: string): Promise<void> {
  try {
    const { data, error } = await opencodeClient.global.health();

    if (error || !data) {
      await sendDingTalkMessage(userId, "❌ OpenCode server is unavailable.");
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
    await sendDingTalkMessage(userId, message);
  } catch (err) {
    logger.error("[DingTalk] Error in status command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to fetch status.");
  }
}

async function handleNewCommand(userId: string): Promise<void> {
  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendDingTalkMessage(userId, t("new.project_not_selected"));
      return;
    }

    const { data: session, error } = await opencodeClient.session.create({
      directory: currentProject.worktree,
    });

    if (error || !session) {
      await sendDingTalkMessage(userId, "❌ Failed to create session.");
      return;
    }

    logger.info(`[DingTalk] Created new session: id=${session.id}, title="${session.title}"`);

    setCurrentSession({
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    });

    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_session_created");
    await ingestSessionInfoForCache(session);

    await sendDingTalkMessage(userId, `✅ New session created: **${session.title}**`);
  } catch (err) {
    logger.error("[DingTalk] Error in new command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to create session.");
  }
}

async function handleStopCommand(userId: string): Promise<void> {
  try {
    clearDingTalkActive();
    stopEventListening();
    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_stop_command");

    const currentSession = getCurrentSession();
    if (!currentSession) {
      await sendDingTalkMessage(userId, t("stop.no_active_session"));
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
        logger.warn("[DingTalk] Abort request failed:", abortError);
        await sendDingTalkMessage(userId, "⚠️ Stop signal sent, but server did not confirm abort.");
        return;
      }

      await sendDingTalkMessage(userId, "✅ Session stopped.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        await sendDingTalkMessage(
          userId,
          "⚠️ Stop request timed out. The session may still be running.",
        );
      } else {
        throw err;
      }
    }
  } catch (err) {
    logger.error("[DingTalk] Error in stop command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to stop session.");
  }
}

async function handleProjectsCommand(userId: string): Promise<void> {
  try {
    const projects = await getProjects();

    if (projects.length === 0) {
      await sendDingTalkMessage(userId, "No projects found. Make sure OpenCode server is running.");
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

    await sendDingTalkMessage(userId, message);
  } catch (err) {
    logger.error("[DingTalk] Error in projects command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to load projects.");
  }
}

async function handleProjectCommand(userId: string, arg: string): Promise<void> {
  const trimmedArg = arg.trim();

  if (!trimmedArg) {
    await sendDingTalkMessage(
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
        await sendDingTalkMessage(
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
      clearAllInteractionState("dingtalk_project_switch");

      await sendDingTalkMessage(
        userId,
        `✅ Project selected: **${selected.name || selected.worktree}**\n\`${selected.worktree}\``,
      );

      logger.info(`[DingTalk] Project selected by index: ${selected.name || selected.worktree}`);
    } catch (err) {
      logger.error("[DingTalk] Error in project command:", err);
      await sendDingTalkMessage(userId, "❌ Failed to select project.");
    }
    return;
  }

  // Case 2: It's a path - use new logic
  try {
    logger.info(`[DingTalk] Attempting to select project by path: ${trimmedArg}`);

    const { project, isNew, pathCreated } = await ensureProjectByPath(trimmedArg);

    setCurrentProject({
      id: project.id,
      worktree: project.worktree,
      name: project.name || project.worktree,
    });

    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_project_switch");

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

    await sendDingTalkMessage(userId, message);

    logger.info(
      `[DingTalk] Project selected by path: ${project.worktree} (isNew: ${isNew}, pathCreated: ${pathCreated})`,
    );
  } catch (err) {
    logger.error("[DingTalk] Error selecting project by path:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    await sendDingTalkMessage(
      userId,
      `❌ Failed to select project:\n\`\`\`\n${errorMessage}\n\`\`\``,
    );
  }
}

async function handleSessionsCommand(userId: string): Promise<void> {
  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendDingTalkMessage(userId, "❌ No project selected. Use `/projects` first.");
      return;
    }

    const { data: sessions, error } = await opencodeClient.session.list({
      directory: currentProject.worktree,
    });

    if (error || !sessions) {
      await sendDingTalkMessage(userId, "❌ Failed to load sessions.");
      return;
    }

    if (sessions.length === 0) {
      await sendDingTalkMessage(userId, "No sessions found. Send a message to create one.");
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

    await sendDingTalkMessage(userId, message);
  } catch (err) {
    logger.error("[DingTalk] Error in sessions command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to load sessions.");
  }
}

async function handleSessionCommand(userId: string, arg: string): Promise<void> {
  const index = parseInt(arg, 10);
  if (isNaN(index) || index < 1) {
    await sendDingTalkMessage(
      userId,
      "❌ Please provide a valid session number. Use `/sessions` to see the list.",
    );
    return;
  }

  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendDingTalkMessage(userId, "❌ No project selected. Use `/projects` first.");
      return;
    }

    const { data: sessions, error } = await opencodeClient.session.list({
      directory: currentProject.worktree,
    });

    if (error || !sessions) {
      await sendDingTalkMessage(userId, "❌ Failed to load sessions.");
      return;
    }

    const sorted = [...sessions].sort((a, b) => {
      const timeA = a.time?.updated ?? a.time?.created ?? 0;
      const timeB = b.time?.updated ?? b.time?.created ?? 0;
      return timeB - timeA;
    });

    if (index > sorted.length) {
      await sendDingTalkMessage(
        userId,
        `❌ Session #${index} not found. Only ${sorted.length} sessions available.`,
      );
      return;
    }

    const selected = sorted[index - 1];

    // Fetch full session details
    const { data: session, error: sessionError } = await opencodeClient.session.get({
      sessionID: selected.id,
      directory: currentProject.worktree,
    });

    if (sessionError || !session) {
      await sendDingTalkMessage(userId, "❌ Failed to get session details.");
      return;
    }

    logger.info(
      `[DingTalk] Session selected: id=${session.id}, title="${session.title}", project=${currentProject.worktree}`,
    );

    const sessionInfo = {
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    };

    setCurrentSession(sessionInfo);
    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_session_switch");

    await sendDingTalkMessage(userId, `✅ Session selected: **${session.title}**`);

    logger.info(`[DingTalk] Session selected: ${session.title}`);
  } catch (err) {
    logger.error("[DingTalk] Error in session command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to select session.");
  }
}

async function handleRenameCommand(userId: string): Promise<void> {
  try {
    const currentSession = getCurrentSession();
    if (!currentSession) {
      await sendDingTalkMessage(userId, t("rename.no_session"));
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

    // Send prompt message (DingTalk doesn't support the same inline keyboard flow,
    // but user can use /abort to cancel)
    const message =
      t("rename.prompt", { title: currentSession.title }) + "\n\n" + "💡 " + t("rename.hint_abort");
    await sendDingTalkMessage(userId, message);

    logger.info(`[DingTalk] Waiting for new title for session: ${currentSession.id}`);
  } catch (err) {
    logger.error("[DingTalk] Error in rename command:", err);
    await sendDingTalkMessage(userId, t("rename.error"));
  }
}

async function handleHelpCommand(userId: string): Promise<void> {
  const commands = getLocalizedBotCommandsDingTalk();
  const lines = commands.map((item) => `/${item.command} - ${item.description}`);
  // DingTalk markdown needs double newlines for line breaks
  const message = `📖 **Commands**\n\n${lines.join("\n\n")}\n\n_Tip: Use \`/projects\` and \`/project <number>\` to select a project, then \`/sessions\` and \`/session <number>\` to select a session._`;
  await sendDingTalkMessage(userId, message);
}

async function handleAgentListCommand(userId: string): Promise<void> {
  try {
    const agents = await getAvailableAgents();

    if (agents.length === 0) {
      await sendDingTalkMessage(userId, t("agent.list.empty"));
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

    await sendDingTalkMessage(userId, message);
  } catch (err) {
    logger.error("[DingTalk] Error listing agents:", err);
    await sendDingTalkMessage(userId, t("error.load_agents"));
  }
}

async function handleAgentSwitchCommand(userId: string, arg: string): Promise<void> {
  const index = parseInt(arg, 10);

  if (isNaN(index) || index < 1) {
    await sendDingTalkMessage(userId, t("agent.switch.invalid_index"));
    return;
  }

  try {
    const agents = await getAvailableAgents();

    if (index > agents.length) {
      await sendDingTalkMessage(userId, t("agent.switch.invalid_index"));
      return;
    }

    const selectedAgent = agents[index - 1];
    selectAgent(selectedAgent.name);

    await sendDingTalkMessage(
      userId,
      t("agent.switch.success", { name: getAgentDisplayName(selectedAgent.name) }),
    );
  } catch (err) {
    logger.error("[DingTalk] Error switching agent:", err);
    await sendDingTalkMessage(userId, t("agent.switch.error"));
  }
}

async function handleExitCommand(userId: string): Promise<void> {
  await sendDingTalkMessage(userId, t("exit.stopping"));
  await exitApplication("dingtalk:/exit");
}

function getLocalizedBotCommandsDingTalk(): { command: string; description: string }[] {
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

async function handleTextMessage(userId: string, text: string): Promise<void> {
  logger.info(
    `[DingTalk] handleTextMessage called: userId=${userId}, text="${text.substring(0, 50)}..."`,
  );

  // Check if user is in task creation flow
  if (isUserInTaskFlow(userId)) {
    const response = await handleTaskTextInput(userId, text);
    if (response !== null) {
      await sendDingTalkMessage(userId, response);
      return;
    }
  }

  // Check if user is in task list flow
  if (isUserInTaskListFlow(userId)) {
    const response = await handleTaskListTextInput(userId, text);
    if (response !== null) {
      await sendDingTalkMessage(userId, response);
      return;
    }
  }

  // Check if user is in rename flow
  if (renameManager.isWaitingForName()) {
    const sessionInfo = renameManager.getSessionInfo();
    if (sessionInfo) {
      const newTitle = text.trim();
      if (!newTitle) {
        await sendDingTalkMessage(userId, t("rename.empty_title"));
        return;
      }

      logger.info(`[DingTalk] Renaming session ${sessionInfo.sessionId} to: ${newTitle}`);

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

        await sendDingTalkMessage(userId, t("rename.success", { title: newTitle }));
        logger.info(`[DingTalk] Session renamed successfully: ${newTitle}`);
      } catch (err) {
        logger.error("[DingTalk] Error renaming session:", err);
        await sendDingTalkMessage(userId, t("rename.error"));
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
    logger.debug(
      `[DingTalk] Current project: ${currentProject ? currentProject.worktree : "null"}`,
    );

    if (!currentProject) {
      logger.warn(`[DingTalk] No project selected for user ${userId}`);
      await sendDingTalkMessage(
        userId,
        "❌ No project selected. Use `/projects` and `/project <number>` first.",
      );
      return;
    }

    let currentSession = getCurrentSession();

    if (!currentSession || currentSession.directory !== currentProject.worktree) {
      if (currentSession && currentSession.directory !== currentProject.worktree) {
        logger.warn(`[DingTalk] Session/project mismatch. Clearing session context.`);
        stopEventListening();
        summaryAggregator.clear();
        clearAllInteractionState("dingtalk_session_mismatch");
      }

      const { data: session, error } = await opencodeClient.session.create({
        directory: currentProject.worktree,
      });

      if (error || !session) {
        logger.error(`[DingTalk] Failed to create session: ${error || "no session data"}`);
        await sendDingTalkMessage(userId, "❌ Failed to create session.");
        return;
      }

      logger.info(`[DingTalk] Auto-created session: id=${session.id}, title="${session.title}"`);

      currentSession = {
        id: session.id,
        title: session.title,
        directory: currentProject.worktree,
      };

      setCurrentSession(currentSession);
      await ingestSessionInfoForCache(session);
      await sendDingTalkMessage(userId, `📝 New session: **${session.title}**`);
    }

    try {
      const { data: statusData } = await opencodeClient.session.status({
        directory: currentSession.directory,
      });

      if (statusData) {
        const sessionStatus = (statusData as Record<string, { type?: string }>)[currentSession.id];
        if (sessionStatus?.type === "busy") {
          await sendDingTalkMessage(
            userId,
            "⏳ Session is busy. Please wait for the current task to finish, or use `/stop`.",
          );
          return;
        }
      }
    } catch (err) {
      logger.warn("[DingTalk] Failed to check session status:", err);
    }

    await ensureEventSubscription(currentSession.directory);
    logger.debug(`[DingTalk] Event subscription completed for ${currentSession.directory}`);

    installDingTalkEventRouting();
    summaryAggregator.setSession(currentSession.id);

    logger.info(`[DingTalk] Sending "Processing..." message to user ${userId}`);
    await sendDingTalkMessage(userId, "⚙️ Processing…");

    setDingTalkActive(userId);

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
      `[DingTalk] Sending prompt (fire-and-forget): agent=${currentAgent}, session=${currentSession.id}, text="${text.substring(0, 50)}..."`,
    );

    safeBackgroundTask({
      taskName: "dingtalk.session.prompt",
      task: () => {
        logger.debug(`[DingTalk] Executing session.prompt in background task`);
        return opencodeClient.session.prompt(promptOptions);
      },
      onSuccess: ({ error }) => {
        logger.debug(`[DingTalk] session.prompt onSuccess called, error=${error ? "yes" : "no"}`);
        if (error) {
          const details = formatErrorDetails(error, 1500);
          logger.error("[DingTalk] session.prompt API error:", details);
          void sendDingTalkMessage(
            userId,
            `❌ Failed to send prompt.\n\nError details:\n\`\`\`\n${details}\n\`\`\``,
          );
          // 不清除 activeTarget，以便可能接收后续事件
          return;
        }
        logger.info("[DingTalk] session.prompt completed successfully");
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
          logger.warn("[DingTalk] session.prompt connection terminated (network issue):", details);
          // Don't send error to user - SSE might still receive events
          return;
        }

        logger.error("[DingTalk] session.prompt background failure:", details);
        void sendDingTalkMessage(
          userId,
          `❌ Prompt failed.\n\nError details:\n\`\`\`\n${details}\n\`\`\``,
        );
        clearDingTalkActive();
      },
    });
    logger.debug(`[DingTalk] safeBackgroundTask for session.prompt dispatched`);
  } catch (err) {
    logger.error("[DingTalk] Error processing message:", err);
    await sendDingTalkMessage(userId, "❌ An error occurred. Please try again.");
    clearDingTalkActive();
  }
}

function processMessage(userId: string, text: string, sessionWebhook: string): void {
  if (!isUserAllowed(userId)) {
    logger.warn(`[DingTalk] Message from unauthorized user: ${userId}`);
    return;
  }

  setUserSessionWebhook(userId, sessionWebhook);

  // Handle permission replies (/1, /2, /3) first
  if (text === "/1" || text === "/2" || text === "/3") {
    if (hasDingTalkPendingPermission(userId)) {
      const replyMap: Record<string, "once" | "always" | "reject"> = {
        "/1": "once",
        "/2": "always",
        "/3": "reject",
      };
      const reply = replyMap[text];
      const handled = handleDingTalkPermissionReply(userId, reply);
      if (handled) {
        return;
      }
    }
    // No pending permission, treat as unknown command
    void sendDingTalkMessage(userId, "⚠️ No pending permission request.");
    return;
  }

  // Validate slash commands
  if (text.startsWith("/")) {
    const validCommands = getValidCommands();
    const commandName = text.slice(1).split(/\s+/)[0]; // Extract command name after /

    if (!validCommands.includes(commandName)) {
      // Unknown command - show error with available commands
      const commands = getLocalizedBotCommandsDingTalk();
      const lines = commands.map((item) => `/${item.command} - ${item.description}`);
      const message = `⚠️ **Unknown command**: /${commandName}\n\n**Available commands:**\n\n${lines.join("\n\n")}\n\n_Use /help for more details._`;
      void sendDingTalkMessage(userId, message);
      return;
    }
  }

  if (text.startsWith("/status")) {
    void handleStatusCommand(userId);
  } else if (text.startsWith("/new")) {
    void handleNewCommand(userId);
  } else if (text.startsWith("/stop")) {
    void handleStopCommand(userId);
  } else if (text.startsWith("/projects")) {
    void handleProjectsCommand(userId);
  } else if (text.startsWith("/project ")) {
    const arg = text.slice(9).trim();
    void handleProjectCommand(userId, arg);
  } else if (text.startsWith("/sessions")) {
    void handleSessionsCommand(userId);
  } else if (text.startsWith("/session ")) {
    const arg = text.slice(9).trim();
    void handleSessionCommand(userId, arg);
  } else if (text.startsWith("/rename")) {
    void handleRenameCommand(userId);
  } else if (text === "/agents") {
    void handleAgentListCommand(userId);
  } else if (text.startsWith("/agent ")) {
    const arg = text.slice(7).trim();
    void handleAgentSwitchCommand(userId, arg);
  } else if (text.startsWith("/commands")) {
    void (async () => {
      const message = await handleCommandsCommand(userId);
      await sendDingTalkMessage(userId, message);
    })();
  } else if (text.startsWith("/command ")) {
    const args = text.slice(9).trim();
    const parts = args.split(/\s+/, 2);
    const index = parts[0];
    const commandArgs = parts[1] || "";
    void (async () => {
      const message = await handleCommandByIndex(userId, index, commandArgs);
      await sendDingTalkMessage(userId, message);
    })();
  } else if (text.startsWith("/auto_confirm")) {
    const arg = text.slice(13).trim();
    const currentSession = getCurrentSession();

    if (!currentSession) {
      void sendDingTalkMessage(userId, "❌ No active session");
    } else if (arg === "on") {
      setAutoConfirm(currentSession.id, true);
      void sendDingTalkMessage(userId, "✅ Auto_confirm enabled");
    } else if (arg === "off") {
      setAutoConfirm(currentSession.id, false);
      void sendDingTalkMessage(userId, "✅ Auto_confirm disabled");
    } else {
      const status = isAutoConfirmEnabled(currentSession.id);
      void sendDingTalkMessage(userId, `Auto_confirm status: ${status ? "ON" : "OFF"}`);
    }
  } else if (text.startsWith("/exit")) {
    void handleExitCommand(userId);
  } else if (text.startsWith("/tasks")) {
    void (async () => {
      const message = await handleTaskListCommand(userId);
      await sendDingTalkMessage(userId, message);
    })();
  } else if (text.startsWith("/task")) {
    void (async () => {
      const message = await handleTaskCommand(userId);
      await sendDingTalkMessage(userId, message);
    })();
  } else if (text.startsWith("/help") || text === "help" || text === "帮助" || text === "/帮助") {
    void handleHelpCommand(userId);
  } else {
    logger.info(
      `[DingTalk] Routing to handleTextMessage: userId=${userId}, text="${text.substring(0, 30)}..."`,
    );
    const webhook = getUserSessionWebhook(userId);
    logger.debug(
      `[DingTalk] Session webhook for user ${userId}: ${webhook ? "exists" : "missing"}`,
    );
    void handleTextMessage(userId, text);
  }
}

export async function initializeDingTalkHandler(): Promise<void> {
  const { appKey, appSecret } = config.dingtalk;

  if (!appKey || !appSecret) {
    throw new Error(
      "DINGTALK_APP_KEY and DINGTALK_APP_SECRET are required for DingTalk integration",
    );
  }

  const client = initDingTalkClient({ appKey, appSecret });
  setDingTalkClient(client);

  // Register DingTalk notification callback for scheduled tasks
  setDingTalkNotificationCallback(async (text: string) => {
    const userId = config.dingtalk.allowedUserId;
    if (!userId) {
      logger.warn(
        "[DingTalk Task Notification] No allowed user ID configured, cannot send notification",
      );
      return;
    }

    const client = getDingTalkClient();
    const sessionWebhook = getUserSessionWebhook(userId);

    // Try sessionWebhook first
    if (sessionWebhook) {
      try {
        await client.sendMarkdownMessage(sessionWebhook, userId, "OpenCode Task", text);
        logger.info(`[DingTalk Task Notification] Sent via webhook to user ${userId}`);
        return;
      } catch (err) {
        const details = formatDingTalkNetworkError(err);
        if (
          details.includes("400502") ||
          details.includes("400014") ||
          details.includes("session") ||
          details.includes("webhook") ||
          details.includes("expired") ||
          details.includes("invalid")
        ) {
          logger.warn(
            `[DingTalk Task Notification] Webhook expired for user ${userId}, falling back to proactive API...`,
          );
        } else {
          logger.error(`[DingTalk Task Notification] Failed to send via webhook:\n${details}`);
          return;
        }
      }
    }

    // Check proactive risk cooldown
    if (client.hasProactiveRisk(userId)) {
      logger.warn(
        `[DingTalk Task Notification] Skipping proactive send to ${userId} due to recent permission error. User needs to send a message first.`,
      );
      return;
    }

    // Use proactive API
    logger.info(`[DingTalk Task Notification] Using proactive API to send to user ${userId}`);
    const result = await client.sendProactiveMarkdownMessage(userId, "OpenCode Task", text);

    if (!result.ok) {
      logger.error(`[DingTalk Task Notification] Proactive message failed: ${result.error}`);
      if (client.hasProactiveRisk(userId)) {
        logger.warn(
          `[DingTalk Task Notification] Proactive API permission error for ${userId}. Check DingTalk app permissions.`,
        );
      }
    } else {
      logger.info(`[DingTalk Task Notification] Proactive message sent successfully to ${userId}`);
    }
  });

  client.onConnectionStatus(({ connected, registered, reconnecting }) => {
    if (connected && registered && !reconnecting) {
      logger.info("[DingTalk] Connection status: healthy (connected and registered)");
    } else if (reconnecting) {
      logger.warn("[DingTalk] Connection status: reconnecting");
    } else if (!connected) {
      logger.error("[DingTalk] Connection status: disconnected");
    }
  });

  client.onMessage((data) => {
    processMessage(data.userId, data.text, data.sessionWebhook);
  });

  try {
    await client.connectStream();
    logger.info("[DingTalk] Stream mode connected successfully");
  } catch (err) {
    logger.error("[DingTalk] Failed to connect stream (will retry automatically):", err);
    // Don't throw - the underlying library will retry automatically
    // and the connection monitor will track the status
  }
}

export async function sendDingTalkStartupMessage(): Promise<void> {
  const userId = config.dingtalk.allowedUserId;
  if (!userId) {
    logger.debug("[DingTalk] No allowed user ID configured, skipping startup message");
    return;
  }

  const sessionWebhook = getUserSessionWebhook(userId);
  if (!sessionWebhook) {
    logger.debug("[DingTalk] No sessionWebhook for user, skipping startup message");
    return;
  }

  try {
    await sendDingTalkMessage(
      userId,
      "🚀 **OpenCode Bot started!**\n\nUse `/status` to check status, or send a message to begin.",
    );
    logger.info(`[DingTalk] Startup message sent to user ${userId}`);
  } catch (err) {
    logger.error("[DingTalk] Failed to send startup message:", err);
  }
}
