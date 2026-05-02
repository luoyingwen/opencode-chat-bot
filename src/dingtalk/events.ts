import type { DingTalkClient } from "./client.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { formatForDingTalk } from "./formatter.js";
import type { PermissionRequest } from "../permission/types.js";
import type { Question } from "../question/types.js";
import { logger } from "../utils/logger.js";
import { PlatformEventRouter } from "../core/events/platform-router.js";
import { createSharedEventHandlers } from "../core/events/shared-handlers.js";
import type { PlatformEventTarget } from "../core/events/types.js";
import {
  hasPendingTextPermission,
  handlePermissionReply,
} from "../core/text-interactions/permission.js";

interface DingTalkResponseTarget extends PlatformEventTarget {
  userId: string;
  routeKey: string;
  directory: string;
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

export function setDingTalkActive(target: DingTalkResponseTarget): void {
  activeTarget = target;
}

export function clearDingTalkActive(): void {
  activeTarget = null;
}

export function setDingTalkClient(client: DingTalkClient): void {
  dingTalkClient = client;
}

function getRouteKey(userId: string): string {
  return buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
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
        logger.warn(`[DingTalk] Webhook expired for user ${userId}, falling back to proactive API...`);
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

// Create shared event handlers with DingTalk-specific configuration
const sharedHandlers = createSharedEventHandlers<DingTalkResponseTarget>({
  platformName: "DingTalk",
  getActiveTarget: () => activeTarget,
  clearActiveTarget: () => {
    activeTarget = null;
  },
  sendMessage: (target, text) => sendMessage(target.userId, text),
  formatMessage: formatForDingTalk,
  sendParts: async (target, parts) => {
    for (const part of parts) {
      await sendMessage(target.userId, part);
    }
  },
});

// Create platform router
let eventRouter: PlatformEventRouter | null = null;

export function installDingTalkEventRouting(): void {
  if (eventRouter) return;

  eventRouter = new PlatformEventRouter({
    platformName: "DingTalk",
    isActive: isDingTalkActive,
    handlers: {
      onComplete: sharedHandlers.handleComplete,
      onTool: sharedHandlers.handleTool,
      onThinking: sharedHandlers.handleThinking,
      onTokens: sharedHandlers.handleTokens,
      onSessionError: sharedHandlers.handleSessionError,
      onSessionRetry: sharedHandlers.handleSessionRetry,
      onSessionIdle: sharedHandlers.handleIdle,
      onPermission: (request: PermissionRequest) => {
        const target = activeTarget;
        if (!target) return;
        void sharedHandlers.handlePermission(request, target.routeKey, target.directory);
      },
      onQuestion: (questions: Question[], requestID: string) => {
        sharedHandlers.handleQuestion(questions, requestID);
      },
      onQuestionError: () => {
        sharedHandlers.handleQuestionError();
      },
    },
  });

  eventRouter.install();
}

export async function handleDingTalkPermissionReply(
  userId: string,
  reply: "once" | "always" | "reject",
): Promise<boolean> {
  const routeKey = getRouteKey(userId);

  const { handled } = await handlePermissionReply({
    routeKey,
    reply,
    platformName: "DingTalk",
    sendMessage: (message) => sendMessage(userId, message),
  });

  return handled;
}

export function hasDingTalkPendingPermission(userId: string): boolean {
  return hasPendingTextPermission(getRouteKey(userId));
}