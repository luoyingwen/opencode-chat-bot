import { config } from "../config.js";
import { executeOpenCodeCommand } from "../core/commands/index.js";
import {
  executeAgentListCommand,
  executeAgentSwitchCommand,
  executeAutoConfirmCommand,
} from "../core/commands/shared-handlers.js";
import { executeTextPrompt } from "../core/execution/text-prompt.js";
import { defaultOpenCodeGateway } from "../core/opencode/default-gateway.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { settingsConversationRuntime } from "../core/runtime/settings-runtime.js";
import type { ConversationRoute } from "../core/runtime/types.js";
import { handleRenameTextInput, handleRenameFlowSetup } from "../core/text-interactions/rename.js";
import { updateEnvValue } from "../runtime/env-updater.js";
import { initDingTalkClient, getDingTalkClient, formatDingTalkNetworkError } from "./client.js";
import {
  clearDingTalkActive,
  handleDingTalkPermissionReply,
  hasDingTalkPendingPermission,
  getUserSessionWebhook,
  setDingTalkClient,
  setUserSessionWebhook,
} from "./events.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { interactionManager } from "../interaction/manager.js";
import { renameManager } from "../rename/manager.js";
import { stopEventListening } from "../opencode/events.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { handleTaskCommand, handleTaskTextInput, isUserInTaskFlow } from "./task.js";
import {
  handleTaskListCommand,
  handleTaskListTextInput,
  isUserInTaskListFlow,
} from "./tasklist.js";
import { setDingTalkNotificationCallback } from "../scheduled-task/runtime.js";
import { exitApplication } from "../app/exit-app.js";
import { handleCommandsCommand, handleCommandByIndex } from "./commands.js";
import { createDingTalkTextPromptPlatform } from "./prompt-platform.js";
import { getSharedCommands, getValidCommands } from "../bot/commands/definitions.js";

function isUserAllowed(userId: string): boolean {
  const allowed = config.dingtalk.allowedUserId;
  if (!allowed) return true;
  return userId === allowed;
}

function getDingTalkRoute(userId: string): ConversationRoute {
  return { channelId: "dingtalk", accountId: userId };
}

async function getDingTalkState(userId: string) {
  return settingsConversationRuntime.get(getDingTalkRoute(userId));
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
    logger.warn(`[DingTalk] Skipping proactive send to ${userId} due to recent permission error`);
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
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "status",
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to fetch status.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleStopCommand(userId: string): Promise<void> {
  clearDingTalkActive();
  stopEventListening();
  summaryAggregator.clear();
  clearAllInteractionState("dingtalk_stop_command");

  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "stop",
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to stop session.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleProjectsCommand(userId: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "projects",
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to load projects.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleProjectCommand(userId: string, arg: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "project",
    args: arg,
    rawText: `/project ${arg}`,
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to select project.");
    return;
  }

  if (result.effects?.projectChanged) {
    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_project_switch");
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleModelsCommand(userId: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "models",
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to load models.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleModelCommand(userId: string, arg: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "model",
    args: arg,
    rawText: `/model ${arg}`,
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to select model.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleSessionsCommand(userId: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "sessions",
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to load sessions.");
    return;
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleSessionCommand(userId: string, arg: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "dingtalk", accountId: userId },
    userId,
    name: "session",
    args: arg,
    rawText: `/session ${arg}`,
  });

  if (!result) {
    await sendDingTalkMessage(userId, "❌ Failed to select session.");
    return;
  }

  if (result.effects?.sessionChanged) {
    summaryAggregator.clear();
    clearAllInteractionState("dingtalk_session_switch");
  }

  for (const output of result.outputs) {
    await sendDingTalkMessage(userId, output.text);
  }
}

async function handleRenameCommand(userId: string, arg?: string): Promise<void> {
  try {
    const { currentSession } = await getDingTalkState(userId);
    if (!currentSession) {
      await sendDingTalkMessage(userId, t("rename.no_session"));
      return;
    }

    const routeKey = buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
    const message = await handleRenameFlowSetup(routeKey, currentSession, userId, arg);
    await sendDingTalkMessage(userId, message);

    if (!arg?.trim()) {
      logger.info(`[DingTalk] Waiting for new title for session: ${currentSession.id}`);
    }
  } catch (err) {
    logger.error("[DingTalk] Error in rename command:", err);
    await sendDingTalkMessage(userId, t("rename.error"));
  }
}

async function handleHelpCommand(userId: string): Promise<void> {
  const commands = getSharedCommands();
  const lines = commands.map((item) => `/${item.command} - ${item.description}`);
  // DingTalk markdown needs double newlines for line breaks
  const message = `📖 **Commands**\n\n${lines.join("\n\n")}\n\n_Tip: Use \`/projects\` and \`/project <number>\` to select a project, then \`/sessions\` and \`/session <number>\` to select a session._`;
  await sendDingTalkMessage(userId, message);
}

async function handleAgentListCommand(userId: string): Promise<void> {
  const route = getDingTalkRoute(userId);
  const message = await executeAgentListCommand(route);
  await sendDingTalkMessage(userId, message);
}

async function handleAgentSwitchCommand(userId: string, arg: string): Promise<void> {
  const route = getDingTalkRoute(userId);
  const message = await executeAgentSwitchCommand(route, arg);
  await sendDingTalkMessage(userId, message);
}

async function handleExitCommand(userId: string): Promise<void> {
  await sendDingTalkMessage(userId, t("exit.stopping"));
  await exitApplication("dingtalk:/exit");
}

function handlePermissionStatusCommand(userId: string): void {
  if (hasDingTalkPendingPermission(userId)) {
    void sendDingTalkMessage(userId, t("openclaw.permission_pending"));
  } else {
    void sendDingTalkMessage(userId, t("openclaw.permission_hint"));
  }
}

function hasActiveTextInteraction(userId: string): boolean {
  const routeKey = buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
  return (
    isUserInTaskFlow(userId) ||
    isUserInTaskListFlow(userId) ||
    renameManager.isWaitingForName(routeKey)
  );
}

async function handleTextMessage(userId: string, text: string): Promise<void> {
  const routeKey = buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });

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
  if (renameManager.isWaitingForName(routeKey)) {
    const response = await handleRenameTextInput(routeKey, text);
    if (response !== null) {
      await sendDingTalkMessage(userId, response);
      if (interactionManager.getSnapshot()?.kind === "rename") {
        interactionManager.clear("rename_completed");
      }
      return;
    }
  }

  try {
    await executeTextPrompt({
      route: { channelId: "dingtalk", accountId: userId },
      userId,
      text,
      runtime: settingsConversationRuntime,
      gateway: defaultOpenCodeGateway,
      platform: createDingTalkTextPromptPlatform({
        userId,
        sendMessage: (messageText) => sendDingTalkMessage(userId, messageText),
      }),
    });
  } catch (err) {
    logger.error("[DingTalk] Error processing message:", err);
    await sendDingTalkMessage(userId, "❌ An error occurred. Please try again.");
    clearDingTalkActive();
  }
}

async function processMessage(userId: string, text: string, sessionWebhook: string): Promise<void> {
  const allowedUserId = config.dingtalk.allowedUserId;

  if (!allowedUserId?.trim()) {
    const success = await updateEnvValue("DINGTALK_ALLOWED_USER_ID", userId);

    if (success) {
      logger.info(`[DingTalk] Auto-locked to first user: ${userId}`);
      await sendDingTalkMessage(userId, t("auto_lock.success", { userId }));
    } else {
      await sendDingTalkMessage(userId, t("auto_lock.race_rejected"));
      return;
    }
  }

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
      const handled = await handleDingTalkPermissionReply(userId, reply);
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
    if (text === "/cancel" && hasActiveTextInteraction(userId)) {
      void handleTextMessage(userId, text);
      return;
    }

    const validCommands = getValidCommands();
    const commandName = text.slice(1).split(/\s+/)[0]; // Extract command name after /

    if (!validCommands.includes(commandName)) {
      // Unknown command - show error with available commands
      const commands = getSharedCommands();
      const lines = commands.map((item) => `/${item.command} - ${item.description}`);
      const message = `⚠️ **Unknown command**: /${commandName}\n\n**Available commands:**\n\n${lines.join("\n\n")}\n\n_Use /help for more details._`;
      void sendDingTalkMessage(userId, message);
      return;
    }
  }

  if (text.startsWith("/status")) {
    void handleStatusCommand(userId);
  } else if (text.startsWith("/stop")) {
    void handleStopCommand(userId);
  } else if (text.startsWith("/projects")) {
    void handleProjectsCommand(userId);
  } else if (text.startsWith("/project ")) {
    const arg = text.slice(9).trim();
    void handleProjectCommand(userId, arg);
  } else if (text.startsWith("/models")) {
    void handleModelsCommand(userId);
  } else if (text.startsWith("/model ")) {
    const arg = text.slice(7).trim();
    void handleModelCommand(userId, arg);
  } else if (text.startsWith("/sessions")) {
    void handleSessionsCommand(userId);
  } else if (text.startsWith("/session ")) {
    const arg = text.slice(9).trim();
    if (arg === "rename" || arg.startsWith("rename ")) {
      void handleRenameCommand(userId, arg.slice(6).trim());
    } else {
      void handleSessionCommand(userId, arg);
    }
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
    void (async () => {
      const route = getDingTalkRoute(userId);
      const message = await executeAutoConfirmCommand(route, arg);
      await sendDingTalkMessage(userId, message);
    })();
  } else if (text.startsWith("/exit")) {
    void handleExitCommand(userId);
  } else if (text.startsWith("/permission")) {
    void handlePermissionStatusCommand(userId);
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
      "🚀 **OpenCode Chat Bot started!**\n\nUse `/status` to check status, or send a message to begin.",
    );
    logger.info(`[DingTalk] Startup message sent to user ${userId}`);
  } catch (err) {
    logger.error("[DingTalk] Failed to send startup message:", err);
  }
}
