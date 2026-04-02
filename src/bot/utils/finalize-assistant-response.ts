import type { StreamingMessagePayload, ResponseStreamer } from "../streaming/response-streamer.js";
import type { TelegramTextFormat } from "./telegram-text.js";

interface FinalizeAssistantResponseOptions {
  responseStreaming: boolean;
  sessionId: string;
  messageId: string;
  messageText: string;
  responseStreamer: Pick<ResponseStreamer, "complete">;
  flushPendingServiceMessages: () => Promise<void>;
  prepareStreamingPayload: (messageText: string) => StreamingMessagePayload | null;
  formatSummary: (messageText: string) => string[];
  resolveFormat: () => TelegramTextFormat;
  getReplyKeyboard: () => unknown;
  sendText: (
    text: string,
    options: { reply_markup: unknown } | undefined,
    format: TelegramTextFormat,
  ) => Promise<void>;
}

export async function finalizeAssistantResponse({
  responseStreaming,
  sessionId,
  messageId,
  messageText,
  responseStreamer,
  flushPendingServiceMessages,
  prepareStreamingPayload,
  formatSummary,
  resolveFormat,
  getReplyKeyboard,
  sendText,
}: FinalizeAssistantResponseOptions): Promise<boolean> {
  let streamedViaMessages = false;

  if (responseStreaming) {
    const preparedStreamPayload = prepareStreamingPayload(messageText);
    if (preparedStreamPayload) {
      preparedStreamPayload.sendOptions = undefined;
      preparedStreamPayload.editOptions = undefined;
    }

    streamedViaMessages = await responseStreamer.complete(
      sessionId,
      messageId,
      preparedStreamPayload ?? undefined,
    );
  }

  await flushPendingServiceMessages();

  if (streamedViaMessages) {
    return true;
  }

  const parts = formatSummary(messageText);
  const format = resolveFormat();

  for (const part of parts) {
    const keyboard = getReplyKeyboard();
    const options = keyboard ? { reply_markup: keyboard } : undefined;
    await sendText(part, options, format);
  }

  return false;
}
