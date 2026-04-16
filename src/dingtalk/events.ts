import type { DingTalkClient } from "./client.js";
import { formatForDingTalk } from "./formatter.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import type { PermissionRequest } from "../permission/types.js";
import { getCurrentSession } from "../session/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { opencodeClient } from "../opencode/client.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { isAutoConfirmEnabled } from "../permission/auto-confirm.js";

interface DingTalkResponseTarget {
  userId: string;
}

let dingTalkClient: DingTalkClient | null = null;
let activeTarget: DingTalkResponseTarget | null = null;

const userSessionWebhooks: Map<string, string> = new Map();

export function getUserSessionWebhook(userId: string): string | undefined {
  return userSessionWebhooks.get(userId);
}

export function setUserSessionWebhook(userId: string, webhook: string): void {
  userSessionWebhooks.set(userId, webhook);
}

export function isDingTalkActive(): boolean {
  return activeTarget !== null;
}

export function setDingTalkActive(userId: string): void {
  activeTarget = { userId };
}

export function clearDingTalkActive(): void {
  activeTarget = null;
}

export function setDingTalkClient(client: DingTalkClient): void {
  dingTalkClient = client;
}

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

let callbacksInstalled = false;

export function installDingTalkEventRouting(): void {
  if (callbacksInstalled) return;
  callbacksInstalled = true;

  patchAggregatorCallback("setOnComplete", "onComplete", handleDingTalkComplete);
  patchAggregatorCallback("setOnTool", "onTool", handleDingTalkTool);
  patchAggregatorCallback("setOnThinking", "onThinking", handleDingTalkThinking);
  patchAggregatorCallback("setOnTokens", "onTokens", handleDingTalkTokens);
  patchAggregatorCallback("setOnSessionError", "onSessionError", handleDingTalkSessionError);
  patchAggregatorCallback("setOnSessionRetry", "onSessionRetry", handleDingTalkSessionRetry);
  patchAggregatorCallback("setOnSessionIdle", "onSessionIdle", handleDingTalkIdle);
  patchAggregatorCallback("setOnPermission", "onPermission", handleDingTalkPermission);

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

  logger.info("[DingTalk] Event routing callbacks installed");
}

function patchAggregatorCallback<K extends keyof OriginalCallbacks>(
  setterName: string,
  callbackKey: K,
  dingTalkHandler: OriginalCallbacks[K] extends ((...args: infer A) => void) | null
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
      if (isDingTalkActive()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dingTalkHandler as (...a: any[]) => void)(...args);
      } else {
        if (otherCallback) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (otherCallback as (...a: any[]) => void)(...args);
        }
      }
    });
  };
}

async function sendMessage(userId: string, text: string): Promise<void> {
  if (!dingTalkClient) return;

  const sessionWebhook = getUserSessionWebhook(userId);

  if (sessionWebhook) {
    try {
      await dingTalkClient.sendMarkdownMessage(sessionWebhook, userId, "OpenCode", text);
      logger.info(
        `[DingTalk] Message sent to user ${userId}: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`,
      );
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (
        errorMessage.includes("400502") ||
        errorMessage.includes("400014") ||
        errorMessage.includes("session") ||
        errorMessage.includes("webhook") ||
        errorMessage.includes("expired") ||
        errorMessage.includes("invalid")
      ) {
        logger.warn(
          `[DingTalk] Webhook expired for user ${userId}, falling back to proactive API...`,
        );
        userSessionWebhooks.delete(userId);
      } else {
        logger.error("[DingTalk] Failed to send message via webhook:", err);
        return;
      }
    }
  }

  if (dingTalkClient.hasProactiveRisk(userId)) {
    logger.warn(
      `[DingTalk] Skipping proactive send to ${userId} due to recent permission error. User needs to send a message first.`,
    );
    return;
  }

  logger.info(`[DingTalk] Using proactive API to send message to user ${userId}`);
  const result = await dingTalkClient.sendProactiveMarkdownMessage(userId, "OpenCode", text);

  if (!result.ok) {
    logger.error(`[DingTalk] Proactive message failed: ${result.error}`);
    if (dingTalkClient.hasProactiveRisk(userId)) {
      logger.warn(
        `[DingTalk] Proactive API permission error detected for ${userId}. User may need to send a message first, or check DingTalk app permissions.`,
      );
    }
  } else {
    logger.info(`[DingTalk] Proactive message sent successfully to ${userId}`);
  }
}

function handleDingTalkComplete(sessionId: string, _messageId: string, messageText: string): void {
  const target = activeTarget;
  if (!target) {
    logger.debug("[DingTalk] handleDingTalkComplete: no active target, skipping");
    return;
  }

  const currentSession = getCurrentSession();
  if (currentSession?.id !== sessionId) {
    logger.debug(
      `[DingTalk] handleDingTalkComplete: session mismatch, current=${currentSession?.id}, expected=${sessionId}`,
    );
    return;
  }

  logger.info(`[DingTalk] Sending completion message to user ${target.userId}`);

  const sendResponse = async () => {
    try {
      const parts = formatForDingTalk(messageText);
      if (parts.length === 0) {
        logger.warn("[DingTalk] No content to send after formatting");
        return;
      }

      for (const part of parts) {
        await sendMessage(target.userId, part);
      }
      logger.info(`[DingTalk] Completion message sent successfully (${parts.length} parts)`);
    } catch (err) {
      logger.error("[DingTalk] Error sending completion message:", err);
    }
  };

  void sendResponse();
}

function handleDingTalkTool(toolInfo: ToolInfo): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== toolInfo.sessionId) return;

  const message = formatToolInfo(toolInfo);
  if (!message) return;

  void sendMessage(target.userId, message);
}

function handleDingTalkThinking(sessionId: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  void sendMessage(target.userId, t("bot.thinking"));
}

function handleDingTalkTokens(_tokens: TokensInfo): void {}

function handleDingTalkSessionError(sessionId: string, message: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  const normalizedMessage = message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 19000
      ? `${normalizedMessage.slice(0, 18997)}...`
      : normalizedMessage;

  void sendMessage(target.userId, t("bot.session_error", { message: truncatedMessage }));
  activeTarget = null;
}

function handleDingTalkSessionRetry(retryInfo: SessionRetryInfo): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== retryInfo.sessionId) return;

  const normalizedMessage = retryInfo.message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 19000
      ? `${normalizedMessage.slice(0, 18997)}...`
      : normalizedMessage;

  void sendMessage(target.userId, t("bot.session_retry", { message: truncatedMessage }));
}

function handleDingTalkIdle(sessionId: string): void {
  const target = activeTarget;
  if (!target) {
    logger.debug("[DingTalk] handleDingTalkIdle: no active target, skipping");
    return;
  }

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) {
    logger.debug(
      `[DingTalk] handleDingTalkIdle: session mismatch, current=${currentSession?.id}, expected=${sessionId}`,
    );
    return;
  }

  logger.info(`[DingTalk] Sending completion message (Done) to user ${target.userId}`);
  void sendMessage(target.userId, "✅ Done");
  activeTarget = null;
}

function handleDingTalkPermission(request: PermissionRequest): void {
  const target = activeTarget;
  if (!target) {
    logger.debug("[DingTalk] handleDingTalkPermission: no active target, skipping");
    return;
  }

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== request.sessionID) {
    logger.debug(
      `[DingTalk] handleDingTalkPermission: session mismatch, current=${currentSession?.id}, expected=${request.sessionID}`,
    );
    return;
  }

  // Check if auto-confirm is enabled for this session
  if (isAutoConfirmEnabled(request.sessionID)) {
    logger.info(
      `[DingTalk] Auto-confirming permission: ${request.permission} for session ${request.sessionID}`,
    );

    // Auto-approve with "always"
    handleDingTalkPermissionReply(target.userId, "always");

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
    void sendMessage(target.userId, notification);

    return;
  }

  // Store the permission request
  pendingPermissionRequests.set(target.userId, request);

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
    `[DingTalk] Sending permission request to user ${target.userId}: ${request.permission}`,
  );
  void sendMessage(target.userId, message);
}

/**
 * Handle permission reply from user (/1, /2, /3)
 */
export function handleDingTalkPermissionReply(
  userId: string,
  reply: "once" | "always" | "reject",
): boolean {
  const request = pendingPermissionRequests.get(userId);
  if (!request) {
    logger.debug(`[DingTalk] No pending permission request for user ${userId}`);
    return false;
  }

  const currentSession = getCurrentSession();
  if (!currentSession) {
    logger.warn("[DingTalk] No current session for permission reply");
    return false;
  }

  logger.info(`[DingTalk] Sending permission reply: ${reply}, requestID=${request.id}`);

  // Remove from pending
  pendingPermissionRequests.delete(userId);

  // Send reply to OpenCode
  safeBackgroundTask({
    taskName: "dingtalk.permission.reply",
    task: () =>
      opencodeClient.permission.reply({
        requestID: request.id,
        directory: currentSession.directory,
        reply,
      }),
    onSuccess: ({ error }) => {
      if (error) {
        logger.error("[DingTalk] Failed to send permission reply:", error);
        void sendMessage(userId, "❌ Failed to send permission reply. Please try again.");
        return;
      }
      logger.info("[DingTalk] Permission reply sent successfully");
      // Send confirmation to user
      const replyLabels: Record<string, string> = {
        once: "✅ Allowed once",
        always: "✅ Always allowed",
        reject: "❌ Rejected",
      };
      void sendMessage(userId, replyLabels[reply]);
    },
  });

  return true;
}

/**
 * Check if user has pending permission request
 */
export function hasDingTalkPendingPermission(userId: string): boolean {
  return pendingPermissionRequests.has(userId);
}
