import {
  formatTextPermissionMessage,
  getPermissionEmoji,
  hasPendingTextPermission,
  replyToTextPermission,
  setPendingTextPermission,
} from "../core/text-interactions/permission.js";
import { isAutoConfirmEnabled } from "../permission/auto-confirm.js";
import type { PermissionRequest } from "../permission/types.js";
import type { SessionRetryInfo, TokensInfo, ToolInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { formatToolInfo } from "../summary/formatter.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import type { OpenClawRoute } from "./types.js";
import { getOpenClawRouteKey } from "./route.js";
import { sendOpenClawMessage } from "./client.js";

type CallbackFunction = (...args: unknown[]) => void;

interface OpenClawResponseTarget {
  route: OpenClawRoute;
  routeKey: string;
  sessionId: string;
  directory: string;
}

interface OriginalCallbacks {
  onComplete: ((sessionId: string, messageId: string, messageText: string) => void) | null;
  onTool: ((toolInfo: ToolInfo) => void) | null;
  onThinking: ((sessionId: string) => void) | null;
  onTokens: ((tokens: TokensInfo) => void) | null;
  onSessionError: ((sessionId: string, message: string) => void) | null;
  onSessionRetry: ((retryInfo: SessionRetryInfo) => void) | null;
  onSessionIdle: ((sessionId: string) => void) | null;
  onPermission: ((request: PermissionRequest) => void) | null;
}

interface AggregatorCallbackSetters {
  setOnComplete(callback: OriginalCallbacks["onComplete"]): void;
  setOnTool(callback: OriginalCallbacks["onTool"]): void;
  setOnThinking(callback: OriginalCallbacks["onThinking"]): void;
  setOnTokens(callback: OriginalCallbacks["onTokens"]): void;
  setOnSessionError(callback: OriginalCallbacks["onSessionError"]): void;
  setOnSessionRetry(callback: OriginalCallbacks["onSessionRetry"]): void;
  setOnSessionIdle(callback: OriginalCallbacks["onSessionIdle"]): void;
  setOnPermission(callback: OriginalCallbacks["onPermission"]): void;
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

let activeTarget: OpenClawResponseTarget | null = null;
let callbacksInstalled = false;

export function isOpenClawActive(): boolean {
  return activeTarget !== null;
}

export function setOpenClawActive(target: OpenClawResponseTarget): void {
  activeTarget = target;
}

export function clearOpenClawActive(): void {
  activeTarget = null;
}

export function installOpenClawEventRouting(): void {
  if (callbacksInstalled) {
    return;
  }

  callbacksInstalled = true;
  patchAggregatorCallback("setOnComplete", "onComplete", handleOpenClawComplete);
  patchAggregatorCallback("setOnTool", "onTool", handleOpenClawTool);
  patchAggregatorCallback("setOnThinking", "onThinking", handleOpenClawThinking);
  patchAggregatorCallback("setOnTokens", "onTokens", handleOpenClawTokens);
  patchAggregatorCallback("setOnSessionError", "onSessionError", handleOpenClawSessionError);
  patchAggregatorCallback("setOnSessionRetry", "onSessionRetry", handleOpenClawSessionRetry);
  patchAggregatorCallback("setOnSessionIdle", "onSessionIdle", handleOpenClawIdle);
  patchAggregatorCallback("setOnPermission", "onPermission", handleOpenClawPermission);

  const aggregator = summaryAggregator as unknown as AggregatorCallbackSetters;
  aggregator.setOnComplete(null);
  aggregator.setOnTool(null);
  aggregator.setOnThinking(null);
  aggregator.setOnTokens(null);
  aggregator.setOnSessionError(null);
  aggregator.setOnSessionRetry(null);
  aggregator.setOnSessionIdle(null);
  aggregator.setOnPermission(null);

  logger.info("[OpenClaw] Event routing callbacks installed");
}

function patchAggregatorCallback<K extends keyof OriginalCallbacks>(
  setterName: keyof AggregatorCallbackSetters,
  callbackKey: K,
  openClawHandler: OriginalCallbacks[K] extends ((...args: infer Args) => void) | null
    ? (...args: Args) => void
    : never,
): void {
  const aggregator = summaryAggregator as unknown as Record<
    keyof AggregatorCallbackSetters,
    (callback: OriginalCallbacks[K]) => void
  >;
  const originalSetter = aggregator[setterName].bind(aggregator);

  aggregator[setterName] = (otherCallback: OriginalCallbacks[K]) => {
    originalCallbacks[callbackKey] = otherCallback;

    const routedCallback = ((...args: unknown[]) => {
      if (isOpenClawActive()) {
        (openClawHandler as CallbackFunction)(...args);
        return;
      }

      if (otherCallback) {
        (otherCallback as CallbackFunction)(...args);
      }
    }) as unknown as OriginalCallbacks[K];

    originalSetter(routedCallback);
  };
}

async function sendMessage(target: OpenClawResponseTarget, text: string): Promise<void> {
  await sendOpenClawMessage(target.route, text);
}

function handleOpenClawComplete(sessionId: string, _messageId: string, messageText: string): void {
  const target = activeTarget;
  if (!target || target.sessionId !== sessionId) {
    return;
  }

  void sendMessage(target, messageText);
}

function handleOpenClawTool(toolInfo: ToolInfo): void {
  const target = activeTarget;
  if (!target || target.sessionId !== toolInfo.sessionId) {
    return;
  }

  const message = formatToolInfo(toolInfo);
  if (message) {
    void sendMessage(target, message);
  }
}

function handleOpenClawThinking(sessionId: string): void {
  const target = activeTarget;
  if (!target || target.sessionId !== sessionId) {
    return;
  }

  void sendMessage(target, t("bot.thinking"));
}

function handleOpenClawTokens(_tokens: TokensInfo): void {}

function handleOpenClawSessionError(sessionId: string, message: string): void {
  const target = activeTarget;
  if (!target || target.sessionId !== sessionId) {
    return;
  }

  void sendMessage(
    target,
    t("bot.session_error", { message: message.trim() || t("common.unknown_error") }),
  );
  activeTarget = null;
}

function handleOpenClawSessionRetry(retryInfo: SessionRetryInfo): void {
  const target = activeTarget;
  if (!target || target.sessionId !== retryInfo.sessionId) {
    return;
  }

  void sendMessage(
    target,
    t("bot.session_retry", { message: retryInfo.message.trim() || t("common.unknown_error") }),
  );
}

function handleOpenClawIdle(sessionId: string): void {
  const target = activeTarget;
  if (!target || target.sessionId !== sessionId) {
    return;
  }

  activeTarget = null;
}

function handleOpenClawPermission(request: PermissionRequest): void {
  const target = activeTarget;
  if (!target || target.sessionId !== request.sessionID) {
    return;
  }

  if (isAutoConfirmEnabled(request.sessionID)) {
    void replyToTextPermission({
      routeKey: target.routeKey,
      directory: target.directory,
      reply: "always",
    }).then((result) => {
      if (!result.ok) {
        logger.warn(`[OpenClaw] Auto-confirm permission failed: ${result.label}`);
      }
    });
    return;
  }

  setPendingTextPermission(target.routeKey, request, target.directory);
  void sendMessage(target, formatTextPermissionMessage(request));
  logger.info(
    `[OpenClaw] Permission request sent: requestID=${request.id}, type=${getPermissionEmoji(request.permission)} ${request.permission}`,
  );
}

export function hasOpenClawPendingPermission(route: OpenClawRoute): boolean {
  return hasPendingTextPermission(getOpenClawRouteKey(route));
}

export async function handleOpenClawPermissionReply(
  route: OpenClawRoute,
  reply: "once" | "always" | "reject",
): Promise<string> {
  const result = await replyToTextPermission({ routeKey: getOpenClawRouteKey(route), reply });
  return result.label;
}
