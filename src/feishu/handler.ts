import { config } from "../config.js";
import { executeOpenCodeCommand } from "../core/commands/index.js";
import { executeTextPrompt } from "../core/execution/text-prompt.js";
import { defaultOpenCodeGateway } from "../core/opencode/default-gateway.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { settingsConversationRuntime } from "../core/runtime/settings-runtime.js";
import type { ConversationRoute } from "../core/runtime/types.js";
import { handleRenameTextInput, renameSessionTitle } from "../core/text-interactions/rename.js";
import { initFeishuClient, getFeishuClient } from "./client.js";
import {
  setFeishuClient,
  clearFeishuActive,
  getActiveChatId,
  handleFeishuPermissionReply,
  hasFeishuPendingPermissionForChat,
} from "./events.js";
import {
  getStoredAgent,
  getAvailableAgents,
  selectAgent,
} from "../agent/manager.js";
import { getAgentDisplayName } from "../agent/types.js";
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
import { setFeishuNotificationCallback } from "../scheduled-task/runtime.js";
import { initUserChatStore, storeUserChatMapping, getChatIdForUser } from "./user-chat-store.js";
import { exitApplication } from "../app/exit-app.js";
import {
  handleCommandsCommand,
  handleCommandByIndex,
} from "./commands.js";
import { isAutoConfirmEnabled, setAutoConfirm } from "../permission/auto-confirm.js";
import { createFeishuTextPromptPlatform } from "./prompt-platform.js";

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

function getFeishuRoute(chatId: string, userId: string): ConversationRoute {
  return { channelId: "feishu", accountId: userId, conversationId: chatId };
}

async function getFeishuState(chatId: string, userId: string) {
  return settingsConversationRuntime.get(getFeishuRoute(chatId, userId));
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
  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "status",
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to fetch status.");
    return;
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleStopCommand(chatId: string, userId: string): Promise<void> {
  clearFeishuActive();
  stopEventListening();
  summaryAggregator.clear();
  clearAllInteractionState("feishu_stop_command");

  const client = getFeishuClient();
  const activeChatId = getActiveChatId();
  if (activeChatId && client.hasActiveCard(activeChatId)) {
    client.cleanupCard(activeChatId);
  }

  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "stop",
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to stop session.");
    return;
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleProjectsCommand(chatId: string, userId: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "projects",
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to load projects.");
    return;
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleProjectCommand(chatId: string, userId: string, arg: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "project",
    args: arg,
    rawText: `/project ${arg}`,
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to select project.");
    return;
  }

  if (result.effects?.projectChanged) {
    summaryAggregator.clear();
    clearAllInteractionState("feishu_project_switch");
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleSessionsCommand(chatId: string, userId: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "sessions",
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to load sessions.");
    return;
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleSessionCommand(chatId: string, userId: string, arg: string): Promise<void> {
  const result = await executeOpenCodeCommand({
    route: { channelId: "feishu", accountId: userId, conversationId: chatId },
    userId,
    name: "session",
    args: arg,
    rawText: `/session ${arg}`,
  });

  if (!result) {
    await sendFeishuMessage(chatId, userId, "❌ Failed to select session.");
    return;
  }

  if (result.effects?.sessionChanged) {
    summaryAggregator.clear();
    clearAllInteractionState("feishu_session_switch");
  }

  for (const output of result.outputs) {
    await sendFeishuMessage(chatId, userId, output.text);
  }
}

async function handleRenameCommand(chatId: string, userId: string, arg?: string): Promise<void> {
  try {
    const { currentSession } = await getFeishuState(chatId, userId);
    if (!currentSession) {
      await sendFeishuMessage(chatId, userId, t("rename.no_session"));
      return;
    }

    const routeKey = buildConversationRouteKey({
      channelId: "feishu",
      accountId: userId,
      conversationId: chatId,
    });
    const nextTitle = arg?.trim();
    if (nextTitle) {
      const message = await renameSessionTitle(
        routeKey,
        {
          sessionId: currentSession.id,
          directory: currentSession.directory,
          currentTitle: currentSession.title,
        },
        nextTitle,
      );
      await sendFeishuMessage(chatId, userId, message);
      return;
    }

    // Start rename flow and set up state management
    renameManager.startWaiting(
      currentSession.id,
      currentSession.directory,
      currentSession.title,
      routeKey,
    );
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
    const route = getFeishuRoute(chatId, userId);
    const agents = await getAvailableAgents(route);

    if (agents.length === 0) {
      await sendFeishuMessage(chatId, userId, t("agent.list.empty"));
      return;
    }

    const currentAgent = getStoredAgent(route);
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
    const route = getFeishuRoute(chatId, userId);
    const agents = await getAvailableAgents(route);

    if (index > agents.length) {
      await sendFeishuMessage(chatId, userId, t("agent.switch.invalid_index"));
      return;
    }

    const selectedAgent = agents[index - 1];
    selectAgent(selectedAgent.name, route);

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
    { command: "stop", description: t("cmd.description.stop") },
    { command: "sessions", description: t("cmd.description.sessions") },
    { command: "session <number>", description: "Select a session by number" },
    { command: "session new", description: t("cmd.description.new") },
    { command: "session rename [title]", description: t("cmd.description.rename") },
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
    { command: "task", description: t("cmd.description.task") },
    { command: "tasks", description: t("cmd.description.tasks") },
    { command: "exit", description: t("cmd.description.exit") },
    { command: "help", description: t("cmd.description.help") },
  ];
}

function hasActiveTextInteraction(chatId: string, userId: string): boolean {
  const routeKey = buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });
  return (
    isUserInTaskFlow(userId, chatId) ||
    isUserInTaskListFlow(userId, chatId) ||
    renameManager.isWaitingForName(routeKey)
  );
}

function getValidCommands(): string[] {
  return [
    "status",
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
    "task",
    "tasks",
    "exit",
    "help",
  ];
}

async function handleTextMessage(chatId: string, userId: string, text: string): Promise<void> {
  const routeKey = buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });

  logger.info(
    `[Feishu] handleTextMessage called: userId=${userId}, text="${text.substring(0, 50)}..."`,
  );

  if (isUserInTaskFlow(userId, chatId)) {
    const response = await handleTaskTextInput(userId, chatId, text);
    if (response !== null) {
      await sendFeishuMessage(chatId, userId, response);
      return;
    }
  }

  if (isUserInTaskListFlow(userId, chatId)) {
    const response = await handleTaskListTextInput(userId, chatId, text);
    if (response !== null) {
      await sendFeishuMessage(chatId, userId, response);
      return;
    }
  }

  // Check if user is in rename flow
  if (renameManager.isWaitingForName(routeKey)) {
    const response = await handleRenameTextInput(routeKey, text);
    if (response !== null) {
      await sendFeishuMessage(chatId, userId, response);
      if (interactionManager.getSnapshot()?.kind === "rename") {
        interactionManager.clear("rename_completed");
      }
      return;
    }
  }

  try {
    await executeTextPrompt({
      route: { channelId: "feishu", accountId: userId, conversationId: chatId },
      userId,
      text,
      runtime: settingsConversationRuntime,
      gateway: defaultOpenCodeGateway,
      platform: createFeishuTextPromptPlatform({
        userId,
        chatId,
        sendMessage: (messageText) => sendFeishuMessage(chatId, userId, messageText),
      }),
    });
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
    if (hasFeishuPendingPermissionForChat(userId, chatId)) {
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
    if (text === "/cancel" && hasActiveTextInteraction(chatId, userId)) {
      void handleTextMessage(chatId, userId, text);
      return;
    }

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
    if (arg === "rename" || arg.startsWith("rename ")) {
      void handleRenameCommand(chatId, userId, arg.slice(6).trim());
    } else {
      void handleSessionCommand(chatId, userId, arg);
    }
  } else if (text === "/agents") {
    void handleAgentListCommand(chatId, userId);
  } else if (text.startsWith("/agent ")) {
    const arg = text.slice(7).trim();
    void handleAgentSwitchCommand(chatId, userId, arg);
  } else if (text.startsWith("/tasks")) {
    void (async () => {
      const message = await handleTaskListCommand(userId, chatId);
      await sendFeishuMessage(chatId, userId, message);
    })();
  } else if (text.startsWith("/task")) {
    void (async () => {
      const message = await handleTaskCommand(userId, chatId);
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
    void (async () => {
      const { currentSession } = await getFeishuState(chatId, userId);

      if (!currentSession) {
        await sendFeishuMessage(chatId, userId, "❌ No active session");
      } else if (arg === "on") {
        setAutoConfirm(currentSession.id, true);
        await sendFeishuMessage(chatId, userId, "✅ Auto_confirm enabled");
      } else if (arg === "off") {
        setAutoConfirm(currentSession.id, false);
        await sendFeishuMessage(chatId, userId, "✅ Auto_confirm disabled");
      } else {
        const status = isAutoConfirmEnabled(currentSession.id);
        await sendFeishuMessage(chatId, userId, `Auto_confirm status: ${status ? "ON" : "OFF"}`);
      }
    })();
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
