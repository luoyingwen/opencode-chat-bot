import { describe, expect, it, vi } from "vitest";
import { finalizeAssistantResponse } from "../../../src/bot/utils/finalize-assistant-response.js";

describe("bot/utils/finalize-assistant-response", () => {
  it("completes the response stream and sends final text when streamer reports not streamed", async () => {
    const responseStreamer = {
      complete: vi.fn().mockResolvedValue({ streamed: false, telegramMessageIds: [] }),
    };
    const flushPendingServiceMessages = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    const keyboard = { keyboard: [[{ text: "A" }]] };

    await finalizeAssistantResponse({
      sessionId: "s1",
      messageId: "m1",
      messageText: "final reply",
      responseStreamer,
      flushPendingServiceMessages,
      prepareStreamingPayload: vi.fn(() => ({ parts: ["final reply"], format: "raw" as const })),
      formatSummary: vi.fn(() => ["part 1", "part 2"]),
      formatRawSummary: vi.fn(() => ["part 1", "part 2"]),
      resolveFormat: vi.fn(() => "markdown_v2" as const),
      getReplyKeyboard: vi.fn(() => keyboard),
      sendText,
    });

    expect(responseStreamer.complete).toHaveBeenCalledWith("s1", "m1", {
      parts: ["final reply"],
      format: "raw",
      sendOptions: { disable_notification: true, reply_markup: keyboard },
      editOptions: undefined,
    });
    expect(flushPendingServiceMessages).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      "part 1",
      "part 1",
      { disable_notification: true, reply_markup: keyboard },
      "markdown_v2",
    );
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      "part 2",
      "part 2",
      { disable_notification: true, reply_markup: keyboard },
      "markdown_v2",
    );
  });

  it("finalizes streamed messages in place without re-sending", async () => {
    const responseStreamer = {
      complete: vi.fn().mockResolvedValue({ streamed: true, telegramMessageIds: [101] }),
    };
    const flushPendingServiceMessages = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    const prepareStreamingPayload = vi.fn(() => ({ parts: ["reply"], format: "raw" as const }));
    const keyboard = { keyboard: [[{ text: "ctx" }]] };

    await finalizeAssistantResponse({
      sessionId: "s1",
      messageId: "m1",
      messageText: "reply",
      responseStreamer,
      flushPendingServiceMessages,
      prepareStreamingPayload,
      formatSummary: vi.fn(() => ["reply"]),
      formatRawSummary: vi.fn(() => ["reply"]),
      resolveFormat: vi.fn(() => "raw" as const),
      getReplyKeyboard: vi.fn(() => keyboard),
      sendText,
    });

    expect(responseStreamer.complete).toHaveBeenCalledWith("s1", "m1", {
      parts: ["reply"],
      format: "raw",
      sendOptions: { disable_notification: true, reply_markup: keyboard },
      editOptions: undefined,
    });
    expect(flushPendingServiceMessages).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("still sends with keyboard when streamer reports not streamed", async () => {
    const responseStreamer = {
      complete: vi.fn().mockResolvedValue({ streamed: false, telegramMessageIds: [] }),
    };
    const flushPendingServiceMessages = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    const prepareStreamingPayload = vi.fn(() => ({ parts: ["reply"], format: "raw" as const }));

    await finalizeAssistantResponse({
      sessionId: "s1",
      messageId: "m1",
      messageText: "reply",
      responseStreamer,
      flushPendingServiceMessages,
      prepareStreamingPayload,
      formatSummary: vi.fn(() => ["reply"]),
      formatRawSummary: vi.fn(() => ["reply"]),
      resolveFormat: vi.fn(() => "raw" as const),
      getReplyKeyboard: vi.fn(() => undefined),
      sendText,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith("reply", "reply", { disable_notification: true }, "raw");
  });
});
