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
}: FinalizeAssistantResponseOptions): Promise<boolean> {
  const keyboard = getReplyKeyboard();
  const replyOptions = keyboard ? { reply_markup: keyboard } : undefined;
  const streamSendOptions = {
    disable_notification: true,
    ...(replyOptions ?? {}),
  } as StreamingMessagePayload["sendOptions"];

  const preparedStreamPayload = prepareStreamingPayload(messageText);
  if (preparedStreamPayload) {
    preparedStreamPayload.sendOptions = streamSendOptions;
    preparedStreamPayload.editOptions = undefined;
  }

  const result = await responseStreamer.complete(
    sessionId,
    messageId,
    preparedStreamPayload ?? undefined,
  );

  await flushPendingServiceMessages();

  if (result.streamed) {
    logger.debug(
      `[FinalizeResponse] Finalized streamed assistant message in place: session=${sessionId}, message=${messageId}, telegramMessages=${result.telegramMessageIds.length}`,
    );
    return true;
  }

  const parts = formatSummary(messageText);
  const rawParts = formatRawSummary(messageText);
  const format = resolveFormat();

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    const rawFallbackText = rawParts[partIndex];
    await sendText(part, rawFallbackText, replyOptions, format);
  }

  return false;
}
