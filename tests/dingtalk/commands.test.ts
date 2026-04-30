import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  ensureSubscriptionMock: vi.fn(async () => undefined),
  getConversationStateMock: vi.fn(),
  executeCommandByIndexMock: vi.fn(async () => "ok"),
  setSessionMock: vi.fn(),
  installRoutingMock: vi.fn(),
  setActiveMock: vi.fn(),
}));

vi.mock("../../src/core/execution/event-subscription.js", () => ({
  ensureOpenCodeEventSubscription: mocked.ensureSubscriptionMock,
}));

vi.mock("../../src/settings/manager.js", () => ({
  getConversationState: mocked.getConversationStateMock,
}));

vi.mock("../../src/shared/commands-flow.js", () => ({
  listCommandsForRoute: vi.fn(),
  executeCommandByIndexForRoute: mocked.executeCommandByIndexMock,
}));

vi.mock("../../src/summary/aggregator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/summary/aggregator.js")>();
  actual.summaryAggregator.setSession = mocked.setSessionMock;
  return {
    ...actual,
    summaryAggregator: actual.summaryAggregator,
  };
});

vi.mock("../../src/dingtalk/events.js", () => ({
  installDingTalkEventRouting: mocked.installRoutingMock,
  setDingTalkActive: mocked.setActiveMock,
}));

import { handleCommandByIndex } from "../../src/dingtalk/commands.js";

describe("dingtalk/commands", () => {
  beforeEach(() => {
    mocked.ensureSubscriptionMock.mockClear();
    mocked.getConversationStateMock.mockReset();
    mocked.executeCommandByIndexMock.mockClear();
    mocked.setSessionMock.mockClear();
    mocked.installRoutingMock.mockClear();
    mocked.setActiveMock.mockClear();
    mocked.getConversationStateMock.mockReturnValue({
      currentSession: {
        id: "session-1",
        directory: "D:/repo",
        title: "Current Session",
      },
    });
  });

  it("prepares event routing before executing a command by index", async () => {
    await handleCommandByIndex("user-1", "3");

    expect(mocked.ensureSubscriptionMock).toHaveBeenCalledWith("DingTalk", "D:/repo");
    expect(mocked.installRoutingMock).toHaveBeenCalled();
    expect(mocked.setSessionMock).toHaveBeenCalledWith("session-1");
    expect(mocked.setActiveMock).toHaveBeenCalledWith({
      userId: "user-1",
      routeKey: "dingtalk:user-1",
      sessionId: "session-1",
      directory: "D:/repo",
    });
    expect(mocked.executeCommandByIndexMock).toHaveBeenCalledWith(
      "dingtalk:user-1",
      "dingtalk:user-1",
      "3",
      "",
    );
  });
});