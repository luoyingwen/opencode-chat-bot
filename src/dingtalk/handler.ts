import { config } from "../config.js";
import { initDingTalkClient, getDingTalkClient } from "./client.js";
import {
  setDingTalkClient,
  setDingTalkActive,
  clearDingTalkActive,
  installDingTalkEventRouting,
  setUserSessionWebhook,
  getUserSessionWebhook,
} from "./events.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../session/manager.js";
import { ingestSessionInfoForCache } from "../session/cache-manager.js";
import { getCurrentProject, setCurrentProject } from "../settings/manager.js";
import { getProjects } from "../project/manager.js";
import { getStoredAgent } from "../agent/manager.js";
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
import { processManager } from "../process/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { handleTaskCommand, handleTaskTextInput, isUserInTaskFlow } from "./task.js";
import {
  handleTaskListCommand,
  handleTaskListTextInput,
  isUserInTaskListFlow,
} from "./tasklist.js";

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
  try {
    const client = getDingTalkClient();
    const sessionWebhook = getUserSessionWebhook(userId);
    if (!sessionWebhook) {
      logger.error(`[DingTalk] No sessionWebhook for user ${userId}`);
      return;
    }
    await client.sendMarkdownMessage(sessionWebhook, userId, "OpenCode", text);
  } catch (err) {
    logger.error("[DingTalk] Failed to send message:", err);
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
    let message = `# OpenCode Status\n\n**Health:** ${healthLabel}\n`;

    if (data.version) {
      message += `**Version:** \`${data.version}\`\n`;
    }

    if (processManager.isRunning()) {
      const uptime = processManager.getUptime();
      const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
      message += `**Process:** managed (PID ${processManager.getPID() ?? "-"}, uptime ${uptimeStr}s)\n`;
    }

    const currentAgent = await fetchCurrentAgent();
    if (currentAgent) {
      message += `**Agent:** ${getAgentDisplayName(currentAgent)}\n`;
    }

    const currentModel = fetchCurrentModel();
    message += `**Model:** ${formatModelForDisplay(currentModel.providerID, currentModel.modelID)}\n`;

    const currentProject = getCurrentProject();
    if (currentProject) {
      message += `\n**Project:** ${currentProject.name || currentProject.worktree}\n`;
    } else {
      message += "\nNo project selected. Use `/projects` to choose one.\n";
    }

    const currentSession = getCurrentSession();
    if (currentSession) {
      message += `**Session:** ${currentSession.title}\n`;
    } else {
      message += "No active session. Send a message to create one.\n";
    }

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

      const { error: abortError } = await opencodeClient.session.abort(
        {
          sessionID: currentSession.id,
          directory: currentSession.directory,
        },
        { signal: controller.signal },
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
  const index = parseInt(arg, 10);
  if (isNaN(index) || index < 1) {
    await sendDingTalkMessage(
      userId,
      "❌ Please provide a valid project number. Use `/projects` to see the list.",
    );
    return;
  }

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

    logger.info(`[DingTalk] Project selected: ${selected.name || selected.worktree}`);
  } catch (err) {
    logger.error("[DingTalk] Error in project command:", err);
    await sendDingTalkMessage(userId, "❌ Failed to select project.");
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
    await sendDingTalkMessage(userId, t("rename.prompt", { title: currentSession.title }));
  } catch (err) {
    logger.error("[DingTalk] Error in rename command:", err);
    await sendDingTalkMessage(userId, t("rename.error"));
  }
}

async function handleCommandsCommand(userId: string): Promise<void> {
  try {
    const currentProject = getCurrentProject();
    if (!currentProject) {
      await sendDingTalkMessage(userId, t("bot.project_not_selected"));
      return;
    }

    const { data, error } = await opencodeClient.command.list({
      directory: currentProject.worktree.replace(/\\/g, "/"),
    });

    if (error || !data || data.length === 0) {
      await sendDingTalkMessage(userId, t("commands.empty"));
      return;
    }

    const filtered = data.filter(
      (cmd) => typeof cmd.name === "string" && cmd.name.trim().length > 0,
    );
    if (filtered.length === 0) {
      await sendDingTalkMessage(userId, t("commands.empty"));
      return;
    }

    const lines = filtered.map((cmd) => {
      const desc = cmd.description?.trim() || t("commands.no_description");
      return `• /${cmd.name} — ${desc}`;
    });

    await sendDingTalkMessage(
      userId,
      `📋 **OpenCode Commands** (${filtered.length} available)\n\n${lines.join("\n")}`,
    );
  } catch (err) {
    logger.error("[DingTalk] Error in commands command:", err);
    await sendDingTalkMessage(userId, t("commands.fetch_error"));
  }
}

async function handleOpencodeStartCommand(userId: string): Promise<void> {
  try {
    if (processManager.isRunning()) {
      const uptime = processManager.getUptime();
      const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
      await sendDingTalkMessage(
        userId,
        t("opencode_start.already_running_managed", {
          pid: processManager.getPID() ?? "-",
          seconds: uptimeStr,
        }),
      );
      return;
    }

    try {
      const { data, error } = await opencodeClient.global.health();
      if (!error && data?.healthy) {
        await sendDingTalkMessage(
          userId,
          t("opencode_start.already_running_external", {
            version: data.version || t("common.unknown"),
          }),
        );
        return;
      }
    } catch {
      // Continue with start
    }

    await sendDingTalkMessage(userId, t("opencode_start.starting"));

    const { success, error } = await processManager.start();

    if (!success) {
      await sendDingTalkMessage(
        userId,
        t("opencode_start.start_error", { error: error || t("common.unknown_error") }),
      );
      return;
    }

    const ready = await waitForServerReadyDingTalk(10000);
    if (!ready) {
      await sendDingTalkMessage(
        userId,
        t("opencode_start.started_not_ready", { pid: processManager.getPID() ?? "-" }),
      );
      return;
    }

    const { data: health } = await opencodeClient.global.health();
    await sendDingTalkMessage(
      userId,
      t("opencode_start.success", {
        pid: processManager.getPID() ?? "-",
        version: health?.version || t("common.unknown"),
      }),
    );

    logger.info(`[DingTalk] OpenCode server started, PID=${processManager.getPID()}`);
  } catch (err) {
    logger.error("[DingTalk] Error in opencode_start command:", err);
    await sendDingTalkMessage(userId, t("opencode_start.error"));
  }
}

async function handleOpencodeStopCommand(userId: string): Promise<void> {
  try {
    if (!processManager.isRunning()) {
      try {
        const { data, error } = await opencodeClient.global.health();
        if (!error && data?.healthy) {
          await sendDingTalkMessage(userId, t("opencode_stop.external_running"));
          return;
        }
      } catch {
        // Server not accessible
      }
      await sendDingTalkMessage(userId, t("opencode_stop.not_running"));
      return;
    }

    const pid = processManager.getPID();
    await sendDingTalkMessage(userId, t("opencode_stop.stopping", { pid: pid ?? "-" }));

    const { success, error } = await processManager.stop(5000);

    if (!success) {
      await sendDingTalkMessage(
        userId,
        t("opencode_stop.stop_error", { error: error || t("common.unknown_error") }),
      );
      return;
    }

    await sendDingTalkMessage(userId, t("opencode_stop.success"));
    logger.info("[DingTalk] OpenCode server stopped");
  } catch (err) {
    logger.error("[DingTalk] Error in opencode_stop command:", err);
    await sendDingTalkMessage(userId, t("opencode_stop.error"));
  }
}

async function handleHelpCommand(userId: string): Promise<void> {
  const commands = getLocalizedBotCommandsDingTalk();
  const lines = commands.map((item) => `/${item.command} - ${item.description}`);
  // DingTalk markdown needs double newlines for line breaks
  const message = `📖 **Commands**\n\n${lines.join("\n\n")}\n\n_Tip: Use \`/projects\` and \`/project <number>\` to select a project, then \`/sessions\` and \`/session <number>\` to select a session._`;
  await sendDingTalkMessage(userId, message);
}

async function waitForServerReadyDingTalk(maxWaitMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const { data, error } = await opencodeClient.global.health();
      if (!error && data?.healthy) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
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
    { command: "rename", description: t("cmd.description.rename") },
    { command: "task", description: t("cmd.description.task") },
    { command: "tasklist", description: t("cmd.description.tasklist") },
    { command: "commands", description: t("cmd.description.commands") },
    { command: "opencode_start", description: t("cmd.description.opencode_start") },
    { command: "opencode_stop", description: t("cmd.description.opencode_stop") },
    { command: "help", description: t("cmd.description.help") },
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
  } else if (text.startsWith("/commands")) {
    void handleCommandsCommand(userId);
  } else if (text.startsWith("/opencode_start")) {
    void handleOpencodeStartCommand(userId);
  } else if (text.startsWith("/opencode_stop")) {
    void handleOpencodeStopCommand(userId);
  } else if (text.startsWith("/tasklist")) {
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
