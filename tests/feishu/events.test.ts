import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/slack/events.js", () => ({
  isSlackActive: () => false,
}));

import { t } from "../../src/i18n/index.js";
import { setCurrentSession } from "../../src/session/manager.js";
import { summaryAggregator } from "../../src/summary/aggregator.js";
import {
  clearFeishuActive,
  installFeishuEventRouting,
  setFeishuActive,
  setFeishuClient,
} from "../../src/feishu/events.js";

type FeishuEventsModule = typeof import("../../src/feishu/events.js");

interface SummaryAggregatorTestState {
  onThinkingCallback: ((sessionId: string) => void) | null;
  onIdleCallback: ((sessionId: string) => void) | null;
}

describe("feishu/events", () => {
  const sendMarkdownMessage = vi.fn(async () => ({ ok: true }));
  const addTypingReaction = vi.fn(async () => undefined);
  const getLastIncomingMessageId = vi.fn(() => "incoming-1");
  const hasActiveCard = vi.fn(() => false);

  beforeAll(() => {
    setFeishuClient({
      sendMarkdownMessage,
      addTypingReaction,
      getLastIncomingMessageId,
      hasActiveCard,
    } as unknown as Parameters<FeishuEventsModule["setFeishuClient"]>[0]);

    installFeishuEventRouting();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearFeishuActive();
    (
      summaryAggregator as unknown as {
        setOnThinking: (callback: ((sessionId: string) => void) | null) => void;
        setOnSessionIdle: (callback: ((sessionId: string) => void) | null) => void;
      }
    ).setOnThinking(null);
    (
      summaryAggregator as unknown as {
        setOnThinking: (callback: ((sessionId: string) => void) | null) => void;
        setOnSessionIdle: (callback: ((sessionId: string) => void) | null) => void;
      }
    ).setOnSessionIdle(null);
    setCurrentSession({
      id: "session-1",
      title: "Test Session",
      directory: "D:/repo",
    });
    setFeishuActive("user-1", "chat-1");
  });

  it("sends thinking text when no streaming card is active", async () => {
    const aggregator = summaryAggregator as unknown as SummaryAggregatorTestState;

    aggregator.onThinkingCallback?.("session-1");
    await vi.waitFor(() => {
      expect(sendMarkdownMessage).toHaveBeenCalledWith("chat-1", t("bot.thinking"));
    });
    expect(addTypingReaction).not.toHaveBeenCalled();
  });

  it("sends done message and clears active target when session goes idle", async () => {
    const aggregator = summaryAggregator as unknown as SummaryAggregatorTestState;

    aggregator.onSessionIdleCallback?.("session-1");
    await vi.waitFor(() => {
      expect(sendMarkdownMessage).toHaveBeenCalledWith("chat-1", "✅ Done");
    });

    sendMarkdownMessage.mockClear();
    aggregator.onSessionIdleCallback?.("session-1");
    await vi.waitFor(() => {
      expect(sendMarkdownMessage).not.toHaveBeenCalled();
    });
  });
});
