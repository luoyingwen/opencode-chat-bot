import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  sessionUpdateMock: vi.fn(),
  updateConversationStateMock: vi.fn(),
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      update: mocked.sessionUpdateMock,
    },
  },
}));

vi.mock("../../src/settings/manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/settings/manager.js")>();
  return {
    ...actual,
    updateConversationState: mocked.updateConversationStateMock,
  };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  clearPendingTextPermission,
  getPendingTextPermission,
  hasPendingTextPermission,
  setPendingTextPermission,
} from "../../src/core/text-interactions/permission.js";
import { isTextInteractionCancelInput } from "../../src/core/text-interactions/cancel.js";
import { handleRenameTextInput, renameSessionTitle } from "../../src/core/text-interactions/rename.js";
import { renameManager } from "../../src/rename/manager.js";

describe("text interactions", () => {
  beforeEach(() => {
    renameManager.clear();
    clearPendingTextPermission();
    mocked.sessionUpdateMock.mockReset();
    mocked.updateConversationStateMock.mockReset();
  });

  it("stores rename flows by route key", () => {
    renameManager.startWaiting("session-a", "/repo/a", "Title A", "route:a");
    renameManager.startWaiting("session-b", "/repo/b", "Title B", "route:b");

    expect(renameManager.isWaitingForName("route:a")).toBe(true);
    expect(renameManager.isWaitingForName("route:b")).toBe(true);
    expect(renameManager.getSessionInfo("route:a")).toEqual({
      sessionId: "session-a",
      directory: "/repo/a",
      currentTitle: "Title A",
    });
    expect(renameManager.getSessionInfo("route:b")).toEqual({
      sessionId: "session-b",
      directory: "/repo/b",
      currentTitle: "Title B",
    });
  });

  it("renames only the targeted route flow", async () => {
    renameManager.startWaiting("session-a", "/repo/a", "Old A", "route:a");
    renameManager.startWaiting("session-b", "/repo/b", "Old B", "route:b");
    mocked.sessionUpdateMock.mockResolvedValue({ data: { id: "session-a" }, error: null });

    const result = await handleRenameTextInput("route:a", "New A");

    expect(result).toContain("New A");
    expect(renameManager.isWaitingForName("route:a")).toBe(false);
    expect(renameManager.isWaitingForName("route:b")).toBe(true);
  });

  it("renames directly without entering the waiting flow", async () => {
    mocked.sessionUpdateMock.mockResolvedValue({ data: { id: "session-a" }, error: null });

    const result = await renameSessionTitle(
      "route:a",
      {
        sessionId: "session-a",
        directory: "/repo/a",
        currentTitle: "Old A",
      },
      "New Direct Title",
    );

    expect(result).toContain("New Direct Title");
    expect(mocked.sessionUpdateMock).toHaveBeenCalledWith({
      sessionID: "session-a",
      directory: "/repo/a",
      title: "New Direct Title",
    });
    expect(mocked.updateConversationStateMock).toHaveBeenCalledWith("route:a", {
      currentSession: {
        id: "session-a",
        title: "New Direct Title",
        directory: "/repo/a",
      },
    });
  });

  it("cancels rename flow with the shared cancel inputs", async () => {
    renameManager.startWaiting("session-a", "/repo/a", "Old A", "route:a");

    const result = await handleRenameTextInput("route:a", "/cancel");

    expect(result).toBe("❌ Rename cancelled.");
    expect(renameManager.isWaitingForName("route:a")).toBe(false);
    expect(mocked.sessionUpdateMock).not.toHaveBeenCalled();
  });

  it("recognizes the shared text interaction cancel aliases", () => {
    expect(isTextInteractionCancelInput("取消")).toBe(true);
    expect(isTextInteractionCancelInput("cancel")).toBe(true);
    expect(isTextInteractionCancelInput("/cancel")).toBe(true);
    expect(isTextInteractionCancelInput("/stop")).toBe(false);
  });

  it("stores pending text permissions by route key", () => {
    setPendingTextPermission(
      "route:a",
      {
        id: "request-1",
        sessionID: "session-1",
        permission: "bash",
        patterns: ["npm test"],
        metadata: {},
        always: [],
      },
      "/repo/a",
    );

    expect(hasPendingTextPermission("route:a")).toBe(true);
    expect(getPendingTextPermission("route:a")?.id).toBe("request-1");
    expect(hasPendingTextPermission("route:b")).toBe(false);
  });
});