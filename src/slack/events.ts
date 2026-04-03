/**
 * Slack SSE event routing layer.
 *
 * Since the SummaryAggregator is a singleton with single-callback-per-event
 * design, and both Telegram and Slack share the same OpenCode session, we use
 * a simple "active platform" routing approach:
 *
 * - When a prompt is sent from Slack, set activeSlackChannel so the response
 *   callbacks know to deliver to Slack.
 * - When a prompt is sent from Telegram, clear activeSlackChannel so callbacks
 *   deliver to Telegram (the default path, already wired in bot/index.ts).
 *
 * This module also provides a lightweight message-sending abstraction for Slack
 * so the handler doesn't need to manage channel/ts tracking directly.
 */

import type { App } from "@slack/bolt";
import { formatForSlack } from "./formatter.js";
import { formatToolInfo } from "../summary/formatter.js";
import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../summary/aggregator.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { getCurrentSession } from "../session/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { isDingTalkActive } from "../dingtalk/events.js";

/** The Slack channel + message ts for the current "processing" indicator. */
interface SlackResponseTarget {
  channel: string;
  processingTs?: string;
}

let slackApp: App | null = null;
let activeTarget: SlackResponseTarget | null = null;

/**
 * True when the most recent prompt was sent from Slack.
 * Aggregator callbacks check this to decide where to route.
 */
export function isSlackActive(): boolean {
  return activeTarget !== null;
}

/**
 * Mark Slack as the active response target for the current prompt.
 * Call this BEFORE firing opencodeClient.session.prompt().
 */
export function setSlackActive(channel: string, processingTs?: string): void {
  activeTarget = { channel, processingTs };
}

/**
 * Clear the Slack active target (e.g. when Telegram sends a prompt).
 */
export function clearSlackActive(): void {
  activeTarget = null;
}

/**
 * Store reference to the Slack Bolt app for message sending.
 */
export function setSlackApp(app: App): void {
  slackApp = app;
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function postMessage(channel: string, text: string): Promise<string | undefined> {
  if (!slackApp) return undefined;

  try {
    const result = await slackApp.client.chat.postMessage({
      channel,
      text,
      mrkdwn: true,
    });
    return result.ts;
  } catch (err) {
    logger.error("[Slack] Failed to post message:", err);
    return undefined;
  }
}

async function updateMessage(channel: string, ts: string, text: string): Promise<void> {
  if (!slackApp) return;

  try {
    await slackApp.client.chat.update({
      channel,
      ts,
      text,
    });
  } catch (err) {
    logger.error("[Slack] Failed to update message:", err);
    // Fallback: send as new message
    await postMessage(channel, text);
  }
}

// ─── Aggregator callback wrappers ───────────────────────────────────────
// These are called BY the existing aggregator callbacks (set up in bot/index.ts).
// The Telegram bot's ensureEventSubscription wires its own callbacks, and those
// callbacks remain in place.  We hook in by wrapping the aggregator setters so
// both Telegram AND Slack callbacks run, but only the active platform actually
// sends output.
//
// Implementation strategy: we replace each aggregator callback with a wrapper
// that first checks isSlackActive().  If Slack is active, deliver to Slack and
// skip Telegram.  If Slack is NOT active, call the original Telegram callback.

interface OriginalCallbacks {
  onComplete: ((sessionId: string, _messageId: string, messageText: string) => void) | null;
  onTool: ((toolInfo: ToolInfo) => void) | null;
  onThinking: ((sessionId: string) => void) | null;
  onTokens: ((tokens: TokensInfo) => void) | null;
  onSessionError: ((sessionId: string, message: string) => void) | null;
  onSessionRetry: ((retryInfo: SessionRetryInfo) => void) | null;
}

const originalCallbacks: OriginalCallbacks = {
  onComplete: null,
  onTool: null,
  onThinking: null,
  onTokens: null,
  onSessionError: null,
  onSessionRetry: null,
};

let callbacksInstalled = false;

/**
 * Install Slack routing wrappers on the summaryAggregator callbacks.
 * Must be called AFTER the Telegram bot has wired its own callbacks
 * (i.e. after ensureEventSubscription has run at least once).
 *
 * This function is idempotent — calling it multiple times is safe.
 *
 * In Slack-only mode (no Telegram bot), the Telegram setters are never called,
 * so after patching we also directly install the Slack handlers on the aggregator.
 * If Telegram later registers its callbacks via the patched setters, the combined
 * routing wrapper will replace our direct handlers automatically.
 */
export function installSlackEventRouting(): void {
  if (callbacksInstalled) return;
  callbacksInstalled = true;

  // Capture the current (Telegram) callbacks by patching the setters.
  // We use a monkey-patch approach on the aggregator instance to intercept
  // callback registration.  The aggregator stores callbacks as private fields
  // and exposes setX() methods.  We override each setX() to also capture a
  // reference, then install our combined wrapper.

  // Since the aggregator's callbacks are private, we intercept by re-setting
  // them with our wrappers.  The original Telegram callbacks are captured
  // by reading the current callback reference from the aggregator.
  //
  // Unfortunately the callbacks are private and there's no getter.
  // Instead, we use a different approach: we override the set methods
  // on the prototype so that whenever Telegram re-installs its callbacks
  // (which happens on each ensureEventSubscription call), we wrap them.

  patchAggregatorCallback("setOnComplete", "onComplete", handleSlackComplete);
  patchAggregatorCallback("setOnTool", "onTool", handleSlackTool);
  patchAggregatorCallback("setOnThinking", "onThinking", handleSlackThinking);
  patchAggregatorCallback("setOnTokens", "onTokens", handleSlackTokens);
  patchAggregatorCallback("setOnSessionError", "onSessionError", handleSlackSessionError);
  patchAggregatorCallback("setOnSessionRetry", "onSessionRetry", handleSlackSessionRetry);

  // In Slack-only mode, no Telegram bot exists so the patched setters are never
  // called — the aggregator would have no callbacks at all.  Trigger each patched
  // setter with `null` (no Telegram callback) so the combined routing wrapper is
  // installed immediately with Slack handlers as the sole target.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregator = summaryAggregator as any;
  aggregator.setOnComplete(null);
  aggregator.setOnTool(null);
  aggregator.setOnThinking(null);
  aggregator.setOnTokens(null);
  aggregator.setOnSessionError(null);
  aggregator.setOnSessionRetry(null);

  logger.info("[Slack] Event routing callbacks installed");
}

/**
 * Patch one aggregator setter so future calls go through our routing wrapper.
 */
function patchAggregatorCallback<K extends keyof OriginalCallbacks>(
  setterName: string,
  callbackKey: K,
  slackHandler: OriginalCallbacks[K] extends ((...args: infer A) => void) | null
    ? (...args: A) => void
    : never,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregator = summaryAggregator as any;
  const originalSetter = aggregator[setterName].bind(aggregator);

  aggregator[setterName] = (telegramCallback: OriginalCallbacks[K]) => {
    originalCallbacks[callbackKey] = telegramCallback;

    // Install combined wrapper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalSetter((...args: any[]) => {
      if (isDingTalkActive()) {
        // DingTalk handles its own routing
        return;
      }
      if (isSlackActive()) {
        // Route to Slack
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (slackHandler as (...a: any[]) => void)(...args);
      } else {
        // Route to Telegram (original)
        if (telegramCallback) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (telegramCallback as (...a: any[]) => void)(...args);
        }
      }
    });
  };
}

// ─── Slack-specific event handlers ──────────────────────────────────────

function handleSlackComplete(sessionId: string, _messageId: string, messageText: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (currentSession?.id !== sessionId) return;

  // Clear processing indicator and send final response
  const sendResponse = async () => {
    try {
      const parts = formatForSlack(messageText);

      if (parts.length === 0) return;

      // Update or replace the processing message with the first part
      if (target.processingTs) {
        await updateMessage(target.channel, target.processingTs, parts[0]);
      } else {
        await postMessage(target.channel, parts[0]);
      }

      // Send remaining parts as new messages
      for (let i = 1; i < parts.length; i++) {
        await postMessage(target.channel, parts[i]);
      }
    } catch (err) {
      logger.error("[Slack] Error sending completion message:", err);
    } finally {
      // Clear active target after response is delivered
      activeTarget = null;
    }
  };

  void sendResponse();
}

function handleSlackTool(toolInfo: ToolInfo): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== toolInfo.sessionId) return;

  const message = formatToolInfo(toolInfo);
  if (!message) return;

  void postMessage(target.channel, message);
}

function handleSlackThinking(sessionId: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  void postMessage(target.channel, t("bot.thinking"));
}

function handleSlackTokens(_tokens: TokensInfo): void {
  // Tokens tracking is primarily for Telegram's pinned message context display.
  // For Slack, we skip this — no equivalent UI element.
}

function handleSlackSessionError(sessionId: string, message: string): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== sessionId) return;

  const normalizedMessage = message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 3500 ? `${normalizedMessage.slice(0, 3497)}...` : normalizedMessage;

  void postMessage(target.channel, t("bot.session_error", { message: truncatedMessage }));

  // Clear active target on error
  activeTarget = null;
}

function handleSlackSessionRetry(retryInfo: SessionRetryInfo): void {
  const target = activeTarget;
  if (!target) return;

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.id !== retryInfo.sessionId) return;

  const normalizedMessage = retryInfo.message.trim() || t("common.unknown_error");
  const truncatedMessage =
    normalizedMessage.length > 3500 ? `${normalizedMessage.slice(0, 3497)}...` : normalizedMessage;

  void postMessage(target.channel, t("bot.session_retry", { message: truncatedMessage }));
}
