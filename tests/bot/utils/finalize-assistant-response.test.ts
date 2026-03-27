import { describe, expect, it, vi } from "vitest";
import { finalizeAssistantResponse } from "../../../src/bot/utils/finalize-assistant-response.js";

describe("bot/utils/finalize-assistant-response", () => {
  it("uses the non-streaming send path when response streaming is disabled", async () => {
    const responseStreamer = {
      complete: vi.fn().mockResolvedValue(true),
    };
    const flushPendingServiceMessages = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);

    const streamed = await finalizeAssistantResponse({
      responseStreaming: false,
      sessionId: "s1",
      messageId: "m1",
      messageText: "final reply",
      responseStreamer,
      flushPendingServiceMessages,
      prepareStreamingPayload: vi.fn(),
      formatSummary: vi.fn(() => ["part 1", "part 2"]),
      resolveFormat: vi.fn(() => "markdown_v2"),
      getReplyKeyboard: vi.fn(() => ({ keyboard: [[{ text: "A" }]] })),
      sendText,
    });

    expect(streamed).toBe(false);
    expect(responseStreamer.complete).not.toHaveBeenCalled();
    expect(flushPendingServiceMessages).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      "part 1",
      { reply_markup: { keyboard: [[{ text: "A" }]] } },
      "markdown_v2",
    );
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      "part 2",
      { reply_markup: { keyboard: [[{ text: "A" }]] } },
      "markdown_v2",
    );
  });

  it("skips the non-streaming send path when streaming already delivered the final message", async () => {
    const responseStreamer = {
      complete: vi.fn().mockResolvedValue(true),
    };
    const flushPendingServiceMessages = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    const prepareStreamingPayload = vi.fn(() => ({ parts: ["reply"], format: "raw" as const }));

    const streamed = await finalizeAssistantResponse({
      responseStreaming: true,
      sessionId: "s1",
      messageId: "m1",
      messageText: "reply",
      responseStreamer,
      flushPendingServiceMessages,
      prepareStreamingPayload,
      formatSummary: vi.fn(() => ["reply"]),
      resolveFormat: vi.fn(() => "raw"),
      getReplyKeyboard: vi.fn(() => undefined),
      sendText,
    });

    expect(streamed).toBe(true);
    expect(responseStreamer.complete).toHaveBeenCalledWith("s1", "m1", {
      parts: ["reply"],
      format: "raw",
      sendOptions: undefined,
      editOptions: undefined,
    });
    expect(flushPendingServiceMessages).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });
});
