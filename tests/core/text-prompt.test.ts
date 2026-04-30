import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  ingestSessionInfoForCacheMock: vi.fn(),
  summarySetSessionMock: vi.fn(),
  summaryClearMock: vi.fn(),
  formatErrorDetailsMock: vi.fn(() => "formatted error"),
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("../../src/session/cache-manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/session/cache-manager.js")>();
  return {
    ...actual,
    ingestSessionInfoForCache: mocked.ingestSessionInfoForCacheMock,
  };
});

vi.mock("../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    setSession: mocked.summarySetSessionMock,
    clear: mocked.summaryClearMock,
  },
}));

vi.mock("../../src/utils/error-format.js", () => ({
  formatErrorDetails: mocked.formatErrorDetailsMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    debug: mocked.loggerDebugMock,
    info: mocked.loggerInfoMock,
    warn: mocked.loggerWarnMock,
    error: mocked.loggerErrorMock,
  },
}));

vi.mock("../../src/utils/safe-background-task.js", () => ({
  safeBackgroundTask: ({ task, onSuccess, onError }: { task: () => Promise<unknown>; onSuccess?: (value: unknown) => void; onError?: (error: unknown) => void }) => {
    void task()
      .then((result) => {
        onSuccess?.(result);
      })
      .catch((error) => {
        onError?.(error);
      });
  },
}));

import { executeTextPrompt } from "../../src/core/execution/text-prompt.js";
import type { OpenCodeGateway } from "../../src/core/opencode/types.js";
import type { ConversationRuntime } from "../../src/core/runtime/types.js";

describe("executeTextPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a no-project message when no project is selected", async () => {
    const sendMessage = vi.fn(async () => undefined);

    await executeTextPrompt({
      route: { channelId: "test", accountId: "user-1" },
      userId: "user-1",
      text: "hello",
      runtime: {
        get: vi.fn(async () => ({ routeKey: "test:user-1" })),
        update: vi.fn(),
        clear: vi.fn(),
        getRouteKey: vi.fn(() => "test:user-1"),
      } as unknown as ConversationRuntime,
      gateway: {
        health: vi.fn(),
        listProjects: vi.fn(),
        ensureProjectByPath: vi.fn(),
        createSession: vi.fn(),
        getSessionStatus: vi.fn(),
        promptSession: vi.fn(),
      } as unknown as OpenCodeGateway,
      platform: {
        name: "Test",
        promptTaskName: "test.prompt",
        sessionMismatchReason: "test_mismatch",
        sendMessage,
        ensureEventSubscription: vi.fn(),
        installEventRouting: vi.fn(),
        onBeforePrompt: vi.fn(),
        clearActiveTarget: vi.fn(),
        clearConversationState: vi.fn(),
        stopEventListening: vi.fn(),
      },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "❌ No project selected. Use `/projects` and `/project <number>` first.",
    );
  });

  it("stops before prompt when session is busy", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const promptSession = vi.fn();

    await executeTextPrompt({
      route: { channelId: "test", accountId: "user-1" },
      userId: "user-1",
      text: "hello",
      runtime: {
        get: vi.fn(async () => ({
          routeKey: "test:user-1",
          currentProject: { id: "project-1", worktree: "/repo", name: "repo" },
          currentSession: { id: "session-1", title: "Session", directory: "/repo" },
        })),
        update: vi.fn(),
        clear: vi.fn(),
        getRouteKey: vi.fn(() => "test:user-1"),
      } as unknown as ConversationRuntime,
      gateway: {
        health: vi.fn(),
        listProjects: vi.fn(),
        ensureProjectByPath: vi.fn(),
        createSession: vi.fn(),
        getSessionStatus: vi.fn(async () => ({ "session-1": { type: "busy" } })),
        promptSession,
      } as unknown as OpenCodeGateway,
      platform: {
        name: "Test",
        promptTaskName: "test.prompt",
        sessionMismatchReason: "test_mismatch",
        sendMessage,
        ensureEventSubscription: vi.fn(),
        installEventRouting: vi.fn(),
        onBeforePrompt: vi.fn(),
        clearActiveTarget: vi.fn(),
        clearConversationState: vi.fn(),
        stopEventListening: vi.fn(),
      },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "⏳ Session is busy. Please wait for the current task to finish, or use `/stop`.",
    );
    expect(promptSession).not.toHaveBeenCalled();
  });

  it("dispatches prompt with route state model and agent", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const ensureEventSubscription = vi.fn(async () => undefined);
    const installEventRouting = vi.fn();
    const onBeforePrompt = vi.fn(async () => undefined);
    const promptSession = vi.fn(async () => ({ error: null }));

    await executeTextPrompt({
      route: { channelId: "test", accountId: "user-1", conversationId: "chat-1" },
      userId: "user-1",
      text: "hello world",
      runtime: {
        get: vi.fn(async () => ({
          routeKey: "test:user-1:chat-1",
          currentProject: { id: "project-1", worktree: "/repo", name: "repo" },
          currentSession: { id: "session-1", title: "Session", directory: "/repo" },
          currentAgent: "build",
          currentModel: { providerID: "openai", modelID: "gpt-5", variant: "fast" },
        })),
        update: vi.fn(),
        clear: vi.fn(),
        getRouteKey: vi.fn(() => "test:user-1:chat-1"),
      } as unknown as ConversationRuntime,
      gateway: {
        health: vi.fn(),
        listProjects: vi.fn(),
        ensureProjectByPath: vi.fn(),
        createSession: vi.fn(),
        getSessionStatus: vi.fn(async () => ({ "session-1": { type: "idle" } })),
        promptSession,
      } as unknown as OpenCodeGateway,
      platform: {
        name: "Test",
        promptTaskName: "test.prompt",
        sessionMismatchReason: "test_mismatch",
        sendMessage,
        ensureEventSubscription,
        installEventRouting,
        onBeforePrompt,
        clearActiveTarget: vi.fn(),
        clearConversationState: vi.fn(),
        stopEventListening: vi.fn(),
      },
    });

    expect(ensureEventSubscription).toHaveBeenCalledWith("/repo");
    expect(installEventRouting).toHaveBeenCalled();
    expect(onBeforePrompt).toHaveBeenCalledWith({
      routeKey: "test:user-1:chat-1",
      sessionId: "session-1",
      directory: "/repo",
    });
    expect(mocked.summarySetSessionMock).toHaveBeenCalledWith("session-1");
    expect(promptSession).toHaveBeenCalledWith({
      sessionID: "session-1",
      directory: "/repo",
      parts: [{ type: "text", text: "hello world" }],
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-5" },
      variant: "fast",
    });
  });
});