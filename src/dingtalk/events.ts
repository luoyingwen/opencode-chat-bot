import type { DingTalkClient } from "./client.js";
import { formatForDingTalk } from "./formatter.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { getCurrentSession } from "../session/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";

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
  onComplete: ((sessionId: string, messageText: string) => void) | null;
  onTool: ((toolInfo: ToolInfo) => void) | null;
  onThinking: ((sessionId: string) => void) | null;
  onTokens: ((tokens: TokensInfo) => void) | null;
  onSessionError: ((sessionId: string, message: string) => void) | null;
  onSessionRetry: ((retryInfo: SessionRetryInfo) => void) | null;
  onIdle: ((sessionId: string) => void) | null;
}

const originalCallbacks: OriginalCallbacks = {
  onComplete: null,
  onTool: null,
  onThinking: null,
  onTokens: null,
  onSessionError: null,
  onSessionRetry: null,
  onIdle: null,
};

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
  patchAggregatorCallback("setOnIdle", "onIdle", handleDingTalkIdle);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregator = summaryAggregator as any;
  aggregator.setOnComplete(null);
  aggregator.setOnTool(null);
  aggregator.setOnThinking(null);
  aggregator.setOnTokens(null);
  aggregator.setOnSessionError(null);
  aggregator.setOnSessionRetry(null);
  aggregator.setOnIdle(null);

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
  if (!sessionWebhook) {
    logger.error(`[DingTalk] No sessionWebhook for user ${userId}`);
    return;
  }

  try {
    await dingTalkClient.sendMarkdownMessage(sessionWebhook, userId, "OpenCode", text);
    logger.info(
      `[DingTalk] Message sent to user ${userId}: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`,
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check if webhook expired (common error codes: 400502, 400014, or contains "session" or "webhook")
    if (
      errorMessage.includes("400502") ||
      errorMessage.includes("400014") ||
      errorMessage.includes("session") ||
      errorMessage.includes("webhook") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("invalid")
    ) {
      logger.warn(`[DingTalk] Webhook expired for user ${userId}, clearing...`);
      userSessionWebhooks.delete(userId);

      // Try to notify user they need to send a new message
      try {
        await dingTalkClient.sendTextMessage(
          sessionWebhook,
          userId,
          "⚠️ 连接已过期，请发送任意消息重新激活机器人。",
        );
      } catch {
        // Ignore secondary failure
      }
    } else {
      logger.error("[DingTalk] Failed to send message:", err);
    }
  }
}

function handleDingTalkComplete(sessionId: string, messageText: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (currentSession?.id !== sessionId) return;

  const sendResponse = async () => {
    try {
      const parts = formatForDingTalk(messageText);
      if (parts.length === 0) return;

      for (const part of parts) {
        await sendMessage(target.userId, part);
      }
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
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  void sendMessage(target.userId, "✅ Done");
  activeTarget = null;
}
