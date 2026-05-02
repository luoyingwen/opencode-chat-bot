import type { FeishuClient } from "./client.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import type { PermissionRequest } from "../permission/types.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { PlatformEventRouter } from "../core/events/platform-router.js";
import type { PlatformEventTarget } from "../core/events/types.js";
import {
  formatTextPermissionMessage,
  getPermissionEmoji,
  handlePermissionRequest,
  hasPendingTextPermission,
  handlePermissionReply,
} from "../core/text-interactions/permission.js";

interface FeishuResponseTarget extends PlatformEventTarget {
  userId: string;
  chatId: string;
  routeKey: string;
  directory: string;
  sendMessage?: (text: string) => Promise<void>;
}

let feishuClient: FeishuClient | null = null;
let activeTarget: FeishuResponseTarget | null = null;

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

async function sendMessage(chatId: string, userId: string, text: string): Promise<void> {
  if (!feishuClient) return;

  const result = await feishuClient.sendMarkdownMessage(chatId, text);
  if (!result.ok) {
    logger.error(`[Feishu] Message send failed: ${result.error}`);
  } else {
    logger.info(`[Feishu] Message sent to chat ${chatId}`);
  }
}

// Feishu-specific handlers with card support
function handleFeishuComplete(sessionId: string, _messageId: string, messageText: string): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  if (target.sessionId !== sessionId) return;

  const client = feishuClient;
  const sendResponse = async () => {
    if (client.hasActiveCard(target.chatId)) {
      await client.finalizeCard(target.chatId, "completed", messageText);
      const lastMsgId = client.getLastIncomingMessageId(target.chatId);
      if (lastMsgId) {
        await client.removeTypingReaction(lastMsgId);
      }
    } else {
      await sendMessage(target.chatId, target.userId, messageText);
    }
  };

  void sendResponse();
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
    normalizedMessage.length > 19000 ? `${normalizedMessage.slice(0, 18997)}...` : normalizedMessage;

  if (feishuClient.hasActiveCard(target.chatId)) {
    void feishuClient.finalizeCard(target.chatId, "error", truncatedMessage);
  } else {
    void sendMessage(target.chatId, target.userId, t("bot.session_error", { message: truncatedMessage }));
  }
  activeTarget = null;
}

function handleFeishuSessionRetry(retryInfo: SessionRetryInfo): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  if (target.sessionId !== retryInfo.sessionId) return;

  const normalizedMessage = retryInfo.message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 19000 ? `${normalizedMessage.slice(0, 18997)}...` : normalizedMessage;

  void sendMessage(target.chatId, target.userId, t("bot.session_retry", { message: truncatedMessage }));
}

function handleFeishuIdle(sessionId: string): void {
  const target = activeTarget;
  if (!target || !feishuClient) return;

  if (target.sessionId !== sessionId) return;

  // Clear active target synchronously before async send
  activeTarget = null;

  const client = feishuClient;
  const sendDone = async () => {
    if (client.hasActiveCard(target.chatId)) {
      await client.finalizeCard(target.chatId, "completed", "✅ Done");
      const lastMsgId = client.getLastIncomingMessageId(target.chatId);
      if (lastMsgId) {
        await client.removeTypingReaction(lastMsgId);
      }
    } else {
      await sendMessage(target.chatId, target.userId, "✅ Done");
    }
  };

  void sendDone();
}

async function handleFeishuPermission(request: PermissionRequest): Promise<void> {
  const target = activeTarget;
  if (!target) return;

  if (target.sessionId !== request.sessionID) return;

  const result = await handlePermissionRequest({
    routeKey: target.routeKey,
    request,
    directory: target.directory,
    sessionId: target.sessionId,
  });

  if (result.action === "auto-approved") {
    if (result.autoConfirmResult?.ok) {
      const emoji = getPermissionEmoji(request.permission);
      const notification = `✅ Auto-approved: ${emoji} ${request.permission} permission`;
      await sendMessage(target.chatId, target.userId, notification);
      logger.info(`[Feishu] Auto-approved permission: ${request.permission} for session ${request.sessionID}`);
    } else {
      logger.warn(`[Feishu] Auto-confirm permission failed: ${result.autoConfirmResult?.label}`);
    }
    return;
  }

  const message = formatTextPermissionMessage(request);
  logger.info(`[Feishu] Sending permission request: ${request.permission}`);
  await sendMessage(target.chatId, target.userId, message);
}

// Create platform router
let eventRouter: PlatformEventRouter | null = null;

export function installFeishuEventRouting(): void {
  if (eventRouter) return;

  eventRouter = new PlatformEventRouter({
    platformName: "Feishu",
    isActive: isFeishuActive,
    handlers: {
      onComplete: handleFeishuComplete,
      onTool: handleFeishuTool,
      onThinking: handleFeishuThinking,
      onTokens: handleFeishuTokens,
      onSessionError: handleFeishuSessionError,
      onSessionRetry: handleFeishuSessionRetry,
      onSessionIdle: handleFeishuIdle,
      onPermission: (request: PermissionRequest) => {
        void handleFeishuPermission(request);
      },
    },
  });

  eventRouter.install();
}

export async function handleFeishuPermissionReply(
  userId: string,
  chatId: string,
  reply: "once" | "always" | "reject",
): Promise<boolean> {
  const routeKey = getRouteKey(userId, chatId);

  const { handled } = await handlePermissionReply({
    routeKey,
    reply,
    platformName: "Feishu",
    sendMessage: (message) => sendMessage(chatId, userId, message),
  });

  return handled;
}

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