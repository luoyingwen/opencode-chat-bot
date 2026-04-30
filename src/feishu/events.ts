import type { FeishuClient } from "./client.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import {
  formatTextPermissionMessage,
  getPermissionEmoji,
  hasPendingTextPermission,
  replyToTextPermission,
  setPendingTextPermission,
} from "../core/text-interactions/permission.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import type { PermissionRequest } from "../permission/types.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { isAutoConfirmEnabled } from "../permission/auto-confirm.js";

interface FeishuResponseTarget {
  userId: string;
  chatId: string;
  routeKey: string;
  sessionId: string;
  directory: string;
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

function getRouteKey(userId: string, chatId: string): string {
  return buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });
}

export function setFeishuClient(client: FeishuClient): void {
  feishuClient = client;
}

export function isFeishuActive(): boolean {
  return activeTarget !== null;
}

export function setFeishuActive(target: FeishuResponseTarget): void {
  activeTarget = target;
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

  if (target.sessionId !== sessionId) return;

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

  if (target.sessionId !== toolInfo.sessionId) return;

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

  if (target.sessionId !== sessionId) return;

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

  if (target.sessionId !== sessionId) return;

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

  if (target.sessionId !== retryInfo.sessionId) return;

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

  if (target.sessionId !== sessionId) return;

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

  if (target.sessionId !== request.sessionID) {
    logger.debug(
      `[Feishu] handleFeishuPermission: session mismatch, current=${target.sessionId}, expected=${request.sessionID}`,
    );
    return;
  }

  // Store the permission request first (needed for both auto-confirm and manual)
  setPendingTextPermission(target.routeKey, request, target.directory);

  // Check if auto-confirm is enabled for this session
  if (isAutoConfirmEnabled(request.sessionID)) {
    logger.info(
      `[Feishu] Auto-confirming permission: ${request.permission} for session ${request.sessionID}`,
    );

    // Auto-approve with "always"
    handleFeishuPermissionReply(target.userId, target.chatId, "always");

    // Notify user it was auto-approved
    const emoji = getPermissionEmoji(request.permission);
    const notification = `✅ Auto-approved: ${emoji} ${request.permission} permission`;
    void sendMessage(target.chatId, target.userId, notification);

    return;
  }

  const message = formatTextPermissionMessage(request);

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
  const routeKey = getRouteKey(userId, chatId);
  if (!hasPendingTextPermission(routeKey)) {
    logger.debug(`[Feishu] No pending permission request for user ${userId}`);
    return false;
  }

  logger.info(`[Feishu] Sending permission reply: ${reply}, routeKey=${routeKey}`);

  // Send reply to OpenCode
  safeBackgroundTask({
    taskName: "feishu.permission.reply",
    task: () => replyToTextPermission({ routeKey, reply }),
    onSuccess: (result) => {
      if (!result.ok) {
        logger.error("[Feishu] Failed to send permission reply");
        void sendMessage(chatId, userId, result.label);
        return;
      }
      logger.info("[Feishu] Permission reply sent successfully");
      void sendMessage(chatId, userId, result.label);
    },
  });

  return true;
}

/**
 * Check if user has pending permission request
 */
export function hasFeishuPendingPermission(userId: string): boolean {
  const target = activeTarget;
  if (!target || target.userId !== userId) {
    return false;
  }

  return hasPendingTextPermission(getRouteKey(userId, target.chatId));
}

export function hasFeishuPendingPermissionForChat(userId: string, chatId: string): boolean {
  return hasPendingTextPermission(getRouteKey(userId, chatId));
}
