import type { StreamingMessagePayload, ResponseStreamer } from "../streaming/response-streamer.js";
import type { TelegramTextFormat } from "./telegram-text.js";
import { logger } from "../../utils/logger.js";

interface FinalizeAssistantResponseOptions {
  sessionId: string;
  messageId: string;
  messageText: string;
  responseStreamer: Pick<ResponseStreamer, "complete">;
  flushPendingServiceMessages: () => Promise<void>;
  prepareStreamingPayload: (messageText: string) => StreamingMessagePayload | null;
  formatSummary: (messageText: string) => string[];
  formatRawSummary: (messageText: string) => string[];
  resolveFormat: () => TelegramTextFormat;
  getReplyKeyboard: () => unknown;
  sendText: (
    text: string,
    rawFallbackText: string | undefined,
    options: { reply_markup: unknown } | undefined,
    format: TelegramTextFormat,
  ) => Promise<void>;
  deleteMessages: (messageIds: number[]) => Promise<void>;
}

export async function finalizeAssistantResponse({
  sessionId,
  messageId,
  messageText,
  responseStreamer,
  flushPendingServiceMessages,
  prepareStreamingPayload,
  formatSummary,
  formatRawSummary,
  resolveFormat,
  getReplyKeyboard,
  sendText,
  deleteMessages,
}: FinalizeAssistantResponseOptions): Promise<boolean> {
  let streamedMessageIds: number[] = [];

  const preparedStreamPayload = prepareStreamingPayload(messageText);
  if (preparedStreamPayload) {
    preparedStreamPayload.sendOptions = { disable_notification: true };
    preparedStreamPayload.editOptions = undefined;
  }

  const result = await responseStreamer.complete(
    sessionId,
    messageId,
    preparedStreamPayload ?? undefined,
  );

  if (result.streamed) {
    streamedMessageIds = result.telegramMessageIds;
  }

  await flushPendingServiceMessages();

  // When the response was streamed, delete the streamed messages and re-send
  // via the non-streamed path so the reply keyboard carries the latest context.
  if (streamedMessageIds.length > 0) {
    try {
      await deleteMessages(streamedMessageIds);
    } catch (err) {
      logger.warn(
        "[FinalizeResponse] Failed to delete streamed messages, sending with keyboard anyway:",
        err,
      );
    }
  }

  const parts = formatSummary(messageText);
  const rawParts = formatRawSummary(messageText);
  const format = resolveFormat();

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    const rawFallbackText = rawParts[partIndex];
    const keyboard = getReplyKeyboard();
    const options = keyboard ? { reply_markup: keyboard } : undefined;
    await sendText(part, rawFallbackText, options, format);
  }

  return false;
}
