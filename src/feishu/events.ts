import type { FeishuClient } from "./client.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import type { PermissionRequest } from "../permission/types.js";
import { getCurrentSession } from "../session/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { isSlackActive } from "../slack/events.js";
import { opencodeClient } from "../opencode/client.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { isAutoConfirmEnabled } from "../permission/auto-confirm.js";

interface FeishuResponseTarget {
  userId: string;
  chatId: string;
}

let feishuClient: FeishuClient | null = null;
let activeTarget: FeishuResponseTarget | null = null;
let callbacksInstalled = false;

interface OriginalCallbacks {
  onComplete: ((sessionId: string, _messageId: string, messageText: string) => void) | null;
  onTool: ((toolInfo: ToolInfo) => void) | null;
  onThinking: ((sessionId: string) => void) | null;
  onTokens: ((tokens: TokensInfo) => void) | null;
  onSessionError: ((sessionId: string, message: string) => void) | null;
  onSessionRetry: ((retryInfo: SessionRetryInfo) => void) | null;
  onSessionIdle: ((sessionId: string) => void) | null;
  onPermission: ((request: PermissionRequest) => void) | null;
}

const originalCallbacks: OriginalCallbacks = {
  onComplete: null,
  onTool: null,
  onThinking: null,
  onTokens: null,
  onSessionError: null,
  onSessionRetry: null,
  onSessionIdle: null,
  onPermission: null,
};

// Store pending permission requests (userId -> request)
const pendingPermissionRequests: Map<string, PermissionRequest> = new Map();

export function setFeishuClient(client: FeishuClient): void {
  feishuClient = client;
}

export function isFeishuActive(): boolean {
  return activeTarget !== null;
}

export function setFeishuActive(userId: string, chatId: string): void {
  activeTarget = { userId, chatId };
}

export function clearFeishuActive(): void {
  activeTarget = null;
}

export function getActiveChatId(): string | undefined {
  return activeTarget?.chatId;
}

export function installFeishuEventRouting(): void {
  if (callbacksInstalled) return;
  callbacksInstalled = true;

  patchAggregatorCallback("setOnComplete", "onComplete", handleFeishuComplete);
  patchAggregatorCallback("setOnTool", "onTool", handleFeishuTool);
  patchAggregatorCallback("setOnThinking", "onThinking", handleFeishuThinking);
  patchAggregatorCallback("setOnTokens", "onTokens", handleFeishuTokens);
  patchAggregatorCallback("setOnSessionError", "onSessionError", handleFeishuSessionError);
  patchAggregatorCallback("setOnSessionRetry", "onSessionRetry", handleFeishuSessionRetry);
  patchAggregatorCallback("setOnSessionIdle", "onSessionIdle", handleFeishuIdle);
  patchAggregatorCallback("setOnPermission", "onPermission", handleFeishuPermission);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregator = summaryAggregator as any;
  aggregator.setOnComplete(null);
  aggregator.setOnTool(null);
  aggregator.setOnThinking(null);
  aggregator.setOnTokens(null);
  aggregator.setOnSessionError(null);
  aggregator.setOnSessionRetry(null);
  aggregator.setOnSessionIdle(null);
  aggregator.setOnPermission(null);

  logger.info("[Feishu] Event routing callbacks installed");
}

function patchAggregatorCallback<K extends keyof OriginalCallbacks>(
  setterName: string,
  callbackKey: K,
  feishuHandler: OriginalCallbacks[K] extends ((...args: infer A) => void) | null
    ? (...args: A) => void
    : never,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregator = summaryAggregator as any;
  const originalSetter = aggregator[setterName].bind(aggregator);

  aggregator[setterName] = (otherCallback: OriginalCallbacks[K]) => {
    originalCallbacks[callbackKey] = otherCallback;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalSetter((...args: any[]) => {
      if (isSlackActive()) {
        // Slack handles its own routing
        return;
      }
      if (isFeishuActive()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (feishuHandler as (...a: any[]) => void)(...args);
      } else {
        if (otherCallback) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (otherCallback as (...a: any[]) => void)(...args);
        }
      }
    });
  };
}

async function sendMessage(chatId: string, userId: string, text: string): Promise<void> {
  if (!feishuClient) return;

  const result = await feishuClient.sendMarkdownMessage(chatId, text);
  if (!result.ok) {
    logger.error(`[Feishu] Message send failed: ${result.error}`);
  } else {
    logger.info(`[Feishu] Message sent to chat ${chatId}`);
  }
}

async function handleFeishuComplete(
  sessionId: string,
  _messageId: string,
  messageText: string,
): Promise<void> {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (currentSession?.id !== sessionId) return;

  // Finalize streaming card if active
  if (feishuClient.hasActiveCard(target.chatId)) {
    await feishuClient.finalizeCard(target.chatId, "completed", messageText);
    await feishuClient.removeTypingReaction(
      feishuClient.getLastIncomingMessageId(target.chatId) || "",
    );
  } else {
    // Send regular message
    await sendMessage(target.chatId, target.userId, messageText);
  }
}

function handleFeishuTool(toolInfo: ToolInfo): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== toolInfo.sessionId) return;

  const toolState = toolInfo.state;
  const status =
    toolState.status === "running"
      ? "running"
      : toolState.status === "completed"
        ? "complete"
        : "error";

  if (feishuClient.hasActiveCard(target.chatId)) {
    feishuClient.updateCardContent(target.chatId, "", [{ name: toolInfo.tool, status }]);
  } else {
    const message = formatToolInfo(toolInfo);
    if (!message) return;
    void sendMessage(target.chatId, target.userId, message);
  }
}

function handleFeishuThinking(sessionId: string): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  if (feishuClient.hasActiveCard(target.chatId)) {
    const lastMsgId = feishuClient.getLastIncomingMessageId(target.chatId);
    if (lastMsgId) {
      void feishuClient.addTypingReaction(lastMsgId);
    }
    return;
  }

  void sendMessage(target.chatId, target.userId, t("bot.thinking"));
}

function handleFeishuTokens(_tokens: TokensInfo): void {}

function handleFeishuSessionError(sessionId: string, message: string): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  const normalizedMessage = message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 19000
      ? `${normalizedMessage.slice(0, 18997)}...`
      : normalizedMessage;

  if (feishuClient.hasActiveCard(target.chatId)) {
    void feishuClient.finalizeCard(target.chatId, "error", truncatedMessage);
  } else {
    void sendMessage(
      target.chatId,
      target.userId,
      t("bot.session_error", { message: truncatedMessage }),
    );
  }
  activeTarget = null;
}

function handleFeishuSessionRetry(retryInfo: SessionRetryInfo): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== retryInfo.sessionId) return;

  const normalizedMessage = retryInfo.message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 19000
      ? `${normalizedMessage.slice(0, 18997)}...`
      : normalizedMessage;

  void sendMessage(
    target.chatId,
    target.userId,
    t("bot.session_retry", { message: truncatedMessage }),
  );
}

function handleFeishuIdle(sessionId: string): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  if (feishuClient.hasActiveCard(target.chatId)) {
    activeTarget = null;
    return;
  }

  void sendMessage(target.chatId, target.userId, "✅ Done");
  activeTarget = null;
}

function handleFeishuPermission(request: PermissionRequest): void {
  const target = activeTarget;
  if (!target || !feishuClient) {
    logger.debug("[Feishu] handleFeishuPermission: no active target or client, skipping");
    return;
  }

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== request.sessionID) {
    logger.debug(
      `[Feishu] handleFeishuPermission: session mismatch, current=${currentSession?.id}, expected=${request.sessionID}`,
    );
    return;
  }

  // Store the permission request first (needed for both auto-confirm and manual)
  pendingPermissionRequests.set(target.userId, request);

  // Check if auto-confirm is enabled for this session
  if (isAutoConfirmEnabled(request.sessionID)) {
    logger.info(
      `[Feishu] Auto-confirming permission: ${request.permission} for session ${request.sessionID}`,
    );

    // Auto-approve with "always"
    handleFeishuPermissionReply(target.userId, target.chatId, "always");

    // Notify user it was auto-approved
    const permissionEmoji: Record<string, string> = {
      bash: "💻",
      edit: "✏️",
      write: "📝",
      read: "📖",
      webfetch: "🌐",
      websearch: "🔍",
      glob: "📁",
      grep: "🔎",
      list: "📋",
      task: "📌",
      lsp: "🔧",
      external_directory: "📂",
    };
    const emoji = permissionEmoji[request.permission] || "🔐";
    const notification = `✅ Auto-approved: ${emoji} ${request.permission} permission`;
    void sendMessage(target.chatId, target.userId, notification);

    return;
  }

  // Format permission message
  const permissionEmoji: Record<string, string> = {
    bash: "💻",
    edit: "✏️",
    write: "📝",
    read: "📖",
    webfetch: "🌐",
    websearch: "🔍",
    glob: "📁",
    grep: "🔎",
    list: "📋",
    task: "📌",
    lsp: "🔧",
    external_directory: "📂",
  };
  const emoji = permissionEmoji[request.permission] || "🔐";
  const patterns = request.patterns.join("\n");

  const message = `🔐 **Permission Request**\n\n**Type:** ${emoji} ${request.permission}\n\n**Patterns:**\n\`\`\`\n${patterns}\n\`\`\`\n\nPlease reply with:\n**/1** - Allow once\n**/2** - Always allow\n**/3** - Reject`;

  logger.info(
    `[Feishu] Sending permission request to user ${target.userId}: ${request.permission}`,
  );
  void sendMessage(target.chatId, target.userId, message);
}

/**
 * Handle permission reply from user (/1, /2, /3)
 */
export function handleFeishuPermissionReply(
  userId: string,
  chatId: string,
  reply: "once" | "always" | "reject",
): boolean {
  const request = pendingPermissionRequests.get(userId);
  if (!request) {
    logger.debug(`[Feishu] No pending permission request for user ${userId}`);
    return false;
  }

  const currentSession = getCurrentSession();
  if (!currentSession) {
    logger.warn("[Feishu] No current session for permission reply");
    return false;
  }

  logger.info(`[Feishu] Sending permission reply: ${reply}, requestID=${request.id}`);

  // Remove from pending
  pendingPermissionRequests.delete(userId);

  // Send reply to OpenCode
  safeBackgroundTask({
    taskName: "feishu.permission.reply",
    task: () =>
      opencodeClient.permission.reply({
        requestID: request.id,
        directory: currentSession.directory,
        reply,
      }),
    onSuccess: ({ error }) => {
      if (error) {
        logger.error("[Feishu] Failed to send permission reply:", error);
        void sendMessage(chatId, userId, "❌ Failed to send permission reply. Please try again.");
        return;
      }
      logger.info("[Feishu] Permission reply sent successfully");
      // Send confirmation to user
      const replyLabels: Record<string, string> = {
        once: "✅ Allowed once",
        always: "✅ Always allowed",
        reject: "❌ Rejected",
      };
      void sendMessage(chatId, userId, replyLabels[reply]);
    },
  });

  return true;
}

/**
 * Check if user has pending permission request
 */
export function hasFeishuPendingPermission(userId: string): boolean {
  return pendingPermissionRequests.has(userId);
}
