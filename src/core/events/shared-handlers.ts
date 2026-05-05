import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import { formatToolInfo } from "../../summary/formatter.js";
import type { ToolInfo, SessionRetryInfo } from "../../summary/aggregator.js";
import type { PermissionRequest } from "../../permission/types.js";
import type { PlatformEventTarget } from "./types.js";
import type { Question } from "../../question/types.js";
import { questionManager } from "../../question/manager.js";
import {
  formatTextPermissionMessage,
  getPermissionEmoji,
  handlePermissionRequest,
} from "../text-interactions/permission.js";

export interface SharedEventHandlersConfig<
  TTarget extends PlatformEventTarget = PlatformEventTarget,
> {
  platformName: string;
  getActiveTarget: () => TTarget | null;
  clearActiveTarget: () => void;
  sendMessage: (target: TTarget, text: string) => Promise<void>;
  formatMessage?: (text: string) => string[];
  sendParts?: (target: TTarget, parts: string[]) => Promise<void>;
}

export function createSharedEventHandlers<TTarget extends PlatformEventTarget>(
  config: SharedEventHandlersConfig<TTarget>,
) {
  const handleComplete = (sessionId: string, _messageId: string, messageText: string): void => {
    const target = config.getActiveTarget();
    if (!target) {
      logger.debug(`[${config.platformName}] handleComplete: no active target, skipping`);
      return;
    }

    if (target.sessionId !== sessionId) {
      logger.debug(
        `[${config.platformName}] handleComplete: session mismatch, current=${target.sessionId}, expected=${sessionId}`,
      );
      return;
    }

    logger.info(`[${config.platformName}] Sending completion message`);

    const sendResponse = async () => {
      try {
        if (config.formatMessage && config.sendParts) {
          const parts = config.formatMessage(messageText);
          if (parts.length === 0) {
            logger.warn(`[${config.platformName}] No content to send after formatting`);
            return;
          }
          await config.sendParts(target, parts);
          logger.info(
            `[${config.platformName}] Completion message sent successfully (${parts.length} parts)`,
          );
        } else {
          await config.sendMessage(target, messageText);
          logger.info(`[${config.platformName}] Completion message sent successfully`);
        }
      } catch (err) {
        logger.error(`[${config.platformName}] Error sending completion message:`, err);
      }
    };

    void sendResponse();
  };

  const handleTool = (toolInfo: ToolInfo): void => {
    const target = config.getActiveTarget();
    if (!target || target.sessionId !== toolInfo.sessionId) return;

    const message = formatToolInfo(toolInfo);
    if (!message) return;

    void config.sendMessage(target, message);
  };

  const handleThinking = (sessionId: string): void => {
    const target = config.getActiveTarget();
    if (!target || target.sessionId !== sessionId) return;

    void config.sendMessage(target, t("bot.thinking"));
  };

  const handleTokens = (_tokens: import("../../summary/aggregator.js").TokensInfo): void => {};

  const handleSessionError = (sessionId: string, message: string): void => {
    const target = config.getActiveTarget();
    if (!target || target.sessionId !== sessionId) return;

    const normalizedMessage = message.trim() || t("common.unknown_error");
    const truncatedMessage =
      normalizedMessage.length > 19000
        ? `${normalizedMessage.slice(0, 18997)}...`
        : normalizedMessage;

    void config.sendMessage(target, t("bot.session_error", { message: truncatedMessage }));
    config.clearActiveTarget();
  };

  const handleSessionRetry = (retryInfo: SessionRetryInfo): void => {
    const target = config.getActiveTarget();
    if (!target || target.sessionId !== retryInfo.sessionId) return;

    const normalizedMessage = retryInfo.message.trim() || t("common.unknown_error");
    const truncatedMessage =
      normalizedMessage.length > 19000
        ? `${normalizedMessage.slice(0, 18997)}...`
        : normalizedMessage;

    void config.sendMessage(target, t("bot.session_retry", { message: truncatedMessage }));
  };

  const handleIdle = (sessionId: string): void => {
    const target = config.getActiveTarget();
    if (!target) {
      logger.debug(`[${config.platformName}] handleIdle: no active target, skipping`);
      return;
    }

    if (target.sessionId !== sessionId) {
      logger.debug(
        `[${config.platformName}] handleIdle: session mismatch, current=${target.sessionId}, expected=${sessionId}`,
      );
      return;
    }

    logger.info(`[${config.platformName}] Sending completion message (Done)`);
    void config.sendMessage(target, "✅ Done");
    config.clearActiveTarget();
  };

  const handlePermission = async (
    request: PermissionRequest,
    routeKey: string,
    directory: string,
  ): Promise<void> => {
    const target = config.getActiveTarget();
    if (!target) {
      logger.debug(`[${config.platformName}] handlePermission: no active target, skipping`);
      return;
    }

    if (target.sessionId !== request.sessionID) {
      logger.debug(
        `[${config.platformName}] handlePermission: session mismatch, current=${target.sessionId}, expected=${request.sessionID}`,
      );
      return;
    }

    const result = await handlePermissionRequest({
      routeKey,
      request,
      directory,
      sessionId: target.sessionId,
    });

    if (result.action === "auto-approved") {
      if (result.autoConfirmResult?.ok) {
        const emoji = getPermissionEmoji(request.permission);
        const notification = `✅ Auto-approved: ${emoji} ${request.permission} permission`;
        await config.sendMessage(target, notification);
        logger.info(
          `[${config.platformName}] Auto-approved permission: ${request.permission} for session ${request.sessionID}`,
        );
      } else {
        logger.warn(
          `[${config.platformName}] Auto-confirm permission failed: ${result.autoConfirmResult?.label}`,
        );
      }
      return;
    }

    const message = formatTextPermissionMessage(request);
    logger.info(`[${config.platformName}] Sending permission request: ${request.permission}`);
    await config.sendMessage(target, message);
  };

  const formatQuestionMessage = (questions: Question[]): string => {
    const lines: string[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const headerPrefix = q.header ? `**${q.header}**` : `**Question ${i + 1}**`;
      lines.push(`${headerPrefix}: ${q.question}`);
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        const marker = q.multiple ? `[${j + 1}]` : `${j + 1}`;
        lines.push(`  ${marker}. **${opt.label}** - ${opt.description}`);
      }
      if (q.multiple) {
        lines.push(`  _Select multiple options by replying with numbers (e.g., "1,2,3")_`);
      }
      lines.push("");
    }
    return lines.join("\n");
  };

  const handleQuestion = (questions: Question[], requestID: string): void => {
    const target = config.getActiveTarget();
    if (!target) {
      logger.debug(`[${config.platformName}] handleQuestion: no active target, skipping`);
      return;
    }

    logger.info(
      `[${config.platformName}] Question received: ${questions.length} questions, requestID=${requestID}`,
    );

    questionManager.startQuestions(questions, requestID);

    const message = formatQuestionMessage(questions);
    void config.sendMessage(target, message);
  };

  const handleQuestionError = (): void => {
    const target = config.getActiveTarget();
    if (!target) {
      logger.debug(`[${config.platformName}] handleQuestionError: no active target, skipping`);
      return;
    }

    logger.info(`[${config.platformName}] Question tool error, clearing active poll`);
    questionManager.clear();
  };

  return {
    handleComplete,
    handleTool,
    handleThinking,
    handleTokens,
    handleSessionError,
    handleSessionRetry,
    handleIdle,
    handlePermission,
    handleQuestion,
    handleQuestionError,
  };
}
