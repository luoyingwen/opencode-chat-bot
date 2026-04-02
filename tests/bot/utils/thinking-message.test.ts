import { describe, expect, it, vi } from "vitest";
import { deliverThinkingMessage } from "../../../src/bot/utils/thinking-message.js";
import { t } from "../../../src/i18n/index.js";

describe("bot/utils/thinking-message", () => {
  it("sends thinking immediately when response streaming is enabled", () => {
    const batcher = {
      enqueue: vi.fn(),
      sendTextNow: vi.fn(),
    };

    deliverThinkingMessage("s1", batcher, {
      responseStreaming: true,
      hideThinkingMessages: false,
    });

    expect(batcher.sendTextNow).toHaveBeenCalledWith("s1", t("bot.thinking"), "thinking_started");
    expect(batcher.enqueue).not.toHaveBeenCalled();
  });

  it("keeps thinking as a separate immediate message when response streaming is disabled", () => {
    const batcher = {
      enqueue: vi.fn(),
      sendTextNow: vi.fn(),
    };

    deliverThinkingMessage("s1", batcher, {
      responseStreaming: false,
      hideThinkingMessages: false,
    });

    expect(batcher.sendTextNow).toHaveBeenCalledWith("s1", t("bot.thinking"), "thinking_started");
    expect(batcher.enqueue).not.toHaveBeenCalled();
  });

  it("does not send thinking message when hidden", () => {
    const batcher = {
      enqueue: vi.fn(),
      sendTextNow: vi.fn(),
    };

    deliverThinkingMessage("s1", batcher, {
      responseStreaming: true,
      hideThinkingMessages: true,
    });

    expect(batcher.enqueue).not.toHaveBeenCalled();
    expect(batcher.sendTextNow).not.toHaveBeenCalled();
  });
});
