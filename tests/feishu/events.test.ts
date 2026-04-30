import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../../src/i18n/index.js";
import { clearPendingTextPermission, setPendingTextPermission } from "../../src/core/text-interactions/permission.js";
import { summaryAggregator } from "../../src/summary/aggregator.js";
import {
  clearFeishuActive,
  hasFeishuPendingPermission,
  hasFeishuPendingPermissionForChat,
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
    clearPendingTextPermission();
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
    setFeishuActive({
      userId: "user-1",
      chatId: "chat-1",
      routeKey: "feishu:user-1:chat-1",
      sessionId: "session-1",
      directory: "D:/repo",
    });
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

  it("checks pending permission by explicit chat route even without active target", () => {
    clearFeishuActive();
    setPendingTextPermission(
      "feishu:user-1:chat-1",
      {
        id: "request-1",
        sessionID: "session-1",
        permission: "bash",
        patterns: ["npm test"],
        metadata: {},
        always: [],
      },
      "D:/repo",
    );

    expect(hasFeishuPendingPermissionForChat("user-1", "chat-1")).toBe(true);
    expect(hasFeishuPendingPermissionForChat("user-1", "chat-2")).toBe(false);
    expect(hasFeishuPendingPermission("user-1")).toBe(false);
  });
});
