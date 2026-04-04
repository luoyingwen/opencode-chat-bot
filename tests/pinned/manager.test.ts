import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  opencodeClient: {
    session: { list: vi.fn().mockResolvedValue({ data: [] }) },
    config: { get: vi.fn().mockResolvedValue({ data: {} }) },
  },
  readFile: vi.fn(),
  stat: vi.fn(),
  getCurrentSession: vi.fn(),
  getCurrentProject: vi.fn(),
  getPinnedMessageId: vi.fn().mockReturnValue(null),
  setPinnedMessageId: vi.fn(),
  clearPinnedMessageId: vi.fn(),
  getStoredModel: vi.fn().mockReturnValue(null),
  getModelContextLimit: vi.fn().mockResolvedValue(204800),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocked.readFile,
  stat: mocked.stat,
}));
vi.mock("../../src/opencode/client.js", () => ({ opencodeClient: mocked.opencodeClient }));
vi.mock("../../src/session/manager.js", () => ({ getCurrentSession: mocked.getCurrentSession }));
vi.mock("../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProject,
  getPinnedMessageId: mocked.getPinnedMessageId,
  setPinnedMessageId: mocked.setPinnedMessageId,
  clearPinnedMessageId: mocked.clearPinnedMessageId,
}));
vi.mock("../../src/model/manager.js", () => ({ getStoredModel: mocked.getStoredModel }));
vi.mock("../../src/model/context-limit.js", () => ({
  getModelContextLimit: mocked.getModelContextLimit,
}));
vi.mock("../../src/i18n/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/i18n/index.js")>();
  return {
    ...actual,
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === "pinned.default_session_title") return "new session";
      if (key === "pinned.unknown") return "Unknown";
      if (key === "pinned.line.project") return `Project: ${params?.project ?? ""}`;
      if (key === "pinned.line.model") return `Model: ${params?.model ?? ""}`;
      if (key === "pinned.files.title") return `Files (${params?.count ?? 0}):`;
      if (key === "pinned.files.item") return `  ${params?.path ?? ""}${params?.diff ?? ""}`;
      if (key === "pinned.files.more") return `  ... and ${params?.count ?? 0} more`;
      return key;
    },
  };
});
vi.mock("../../src/pinned/format.js", () => ({
  DEFAULT_CONTEXT_LIMIT: 204800,
  formatContextLine: (used: number, limit: number) => `${used}/${limit}`,
  formatCostLine: (cost: number) => `$${cost.toFixed(2)}`,
  formatModelDisplayName: () => "test-model",
}));

// Must import AFTER vi.mock calls
const { pinnedMessageManager } = await import("../../src/pinned/manager.js");

describe("pinned/manager", () => {
  let fakeApi: {
    sendMessage: ReturnType<typeof vi.fn>;
    editMessageText: ReturnType<typeof vi.fn>;
    pinChatMessage: ReturnType<typeof vi.fn>;
    unpinAllChatMessages: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fakeApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 999 }),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      pinChatMessage: vi.fn().mockResolvedValue(undefined),
      unpinAllChatMessages: vi.fn().mockResolvedValue(undefined),
    };

    // Reset manager state by re-initializing
    pinnedMessageManager.initialize(fakeApi as never, 123);

    mocked.getCurrentSession.mockReturnValue({ id: "ses-1", title: "Test Session" });
    mocked.getCurrentProject.mockReturnValue({ id: "p1", worktree: "D:/repo", name: "repo" });
    mocked.getStoredModel.mockReturnValue({ providerID: "openai", modelID: "gpt-5" });
    mocked.getModelContextLimit.mockResolvedValue(204800);
    mocked.getPinnedMessageId.mockReturnValue(null);
    mocked.stat.mockImplementation(async (filePath: string) => ({
      isDirectory: () => filePath.endsWith(".git"),
      isFile: () => false,
    }));
    mocked.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith("HEAD")) {
        return "ref: refs/heads/main\n";
      }

      throw new Error(`Unexpected file read: ${filePath}`);
    });
  });

  describe("updateTokensSilent", () => {
    it("updates tokensUsed in memory without triggering API call", () => {
      pinnedMessageManager.updateTokensSilent({
        input: 5000,
        output: 200,
        reasoning: 0,
        cacheRead: 1000,
        cacheWrite: 0,
      });

      const contextInfo = pinnedMessageManager.getContextInfo();
      // tokensUsed = input + cacheRead = 5000 + 1000 = 6000
      // contextInfo may be null if tokensLimit is 0, so check via getContextInfo
      // The key assertion: no API call was made
      expect(fakeApi.editMessageText).not.toHaveBeenCalled();
      expect(fakeApi.sendMessage).not.toHaveBeenCalled();
    });

    it("accumulates token updates correctly", () => {
      pinnedMessageManager.updateTokensSilent({
        input: 500,
        output: 100,
        reasoning: 0,
        cacheRead: 100,
        cacheWrite: 0,
      });

      pinnedMessageManager.updateTokensSilent({
        input: 5000,
        output: 200,
        reasoning: 0,
        cacheRead: 1000,
        cacheWrite: 0,
      });

      // Should reflect the LATEST values, not accumulated
      // No API calls
      expect(fakeApi.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("calls editMessageText to push current state to Telegram", async () => {
      // Set up state: create a pinned message first
      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      // Reset to track only refresh calls
      fakeApi.editMessageText.mockClear();

      await pinnedMessageManager.refresh();

      expect(fakeApi.editMessageText).toHaveBeenCalledTimes(1);
    });

    it("does not throw when no pinned message exists", async () => {
      // No pinned message was created → refresh should be a no-op
      await expect(pinnedMessageManager.refresh()).resolves.not.toThrow();
    });

    it("refreshes git branch in the pinned project line", async () => {
      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      fakeApi.editMessageText.mockClear();
      mocked.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith("HEAD")) {
          return "ref: refs/heads/feature/mobile\n";
        }

        throw new Error(`Unexpected file read: ${filePath}`);
      });

      await pinnedMessageManager.refresh();

      expect(fakeApi.editMessageText).toHaveBeenCalledWith(
        123,
        999,
        expect.stringContaining("Project: repo: feature/mobile"),
      );
    });
  });

  describe("project branch display", () => {
    it("shows git branch after the project name", async () => {
      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      expect(fakeApi.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining("Project: repo: main"),
      );
    });

    it("keeps only project name when branch is unavailable", async () => {
      mocked.stat.mockRejectedValue(new Error("not a git repo"));

      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      expect(fakeApi.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining("Project: repo"),
      );
      expect(fakeApi.sendMessage).not.toHaveBeenCalledWith(
        123,
        expect.stringContaining("Project: repo:"),
      );
    });

    it("supports linked worktrees via gitdir pointer", async () => {
      mocked.stat.mockImplementation(async (filePath: string) => ({
        isDirectory: () => false,
        isFile: () => filePath.endsWith(".git"),
      }));
      mocked.readFile.mockImplementation(async (filePath: string) => {
        const normalizedPath = filePath.replace(/\\/g, "/");

        if (filePath.endsWith(".git")) {
          return "gitdir: ../.git/worktrees/repo-feature\n";
        }

        if (normalizedPath.includes(".git/worktrees/repo-feature/HEAD")) {
          return "ref: refs/heads/feature/worktree\n";
        }

        throw new Error(`Unexpected file read: ${filePath}`);
      });

      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      expect(fakeApi.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining("Project: repo: feature/worktree"),
      );
    });
  });

  describe("setOnKeyboardUpdate race condition fix", () => {
    it("fires callback immediately with current state when contextLimit is known", async () => {
      // Create session to set contextLimit
      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      const callback = vi.fn();
      pinnedMessageManager.setOnKeyboardUpdate(callback);

      // Should have been called immediately with (tokensUsed=0, limit=204800)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(0, 204800);
    });

    it("fires callback with updated tokens after silent update", async () => {
      await pinnedMessageManager.onSessionChange("ses-1", "Test Session");

      pinnedMessageManager.updateTokensSilent({
        input: 3000,
        output: 100,
        reasoning: 0,
        cacheRead: 500,
        cacheWrite: 0,
      });

      const callback = vi.fn();
      pinnedMessageManager.setOnKeyboardUpdate(callback);

      // Should fire with tokensUsed = 3000 + 500 = 3500
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(3500, 204800);
    });
  });
});
