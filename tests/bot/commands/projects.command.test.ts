import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { projectsCommand } from "../../../src/bot/commands/projects.js";
import { foregroundSessionState } from "../../../src/scheduled-task/foreground-state.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  syncSessionDirectoryCacheMock: vi.fn(),
  getProjectsMock: vi.fn(),
  replyWithInlineMenuMock: vi.fn(),
}));

vi.mock("../../../src/session/cache-manager.js", () => ({
  syncSessionDirectoryCache: mocked.syncSessionDirectoryCacheMock,
  __resetSessionDirectoryCacheForTests: vi.fn(),
}));

vi.mock("../../../src/project/manager.js", () => ({
  getProjects: mocked.getProjectsMock,
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: vi.fn(() => null),
  setCurrentProject: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  clearSession: vi.fn(),
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: { clear: vi.fn() },
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    clear: vi.fn().mockResolvedValue(undefined),
    refreshContextLimit: vi.fn().mockResolvedValue(undefined),
    getContextLimit: vi.fn(() => 0),
  },
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: {
    initialize: vi.fn(),
    updateContext: vi.fn(),
  },
}));

vi.mock("../../../src/agent/manager.js", () => ({
  getStoredAgent: vi.fn(() => "build"),
}));

vi.mock("../../../src/model/manager.js", () => ({
  getStoredModel: vi.fn(() => ({ providerID: "openai", modelID: "gpt-5", variant: "default" })),
}));

vi.mock("../../../src/variant/manager.js", () => ({
  formatVariantForButton: vi.fn(() => "Default"),
}));

vi.mock("../../../src/interaction/cleanup.js", () => ({
  clearAllInteractionState: vi.fn(),
}));

vi.mock("../../../src/bot/utils/keyboard.js", () => ({
  createMainKeyboard: vi.fn(() => ({ keyboard: true })),
}));

vi.mock("../../../src/bot/handlers/inline-menu.js", () => ({
  appendInlineMenuCancelButton: vi.fn(),
  ensureActiveInlineMenu: vi.fn(),
  replyWithInlineMenu: mocked.replyWithInlineMenuMock,
}));

function createContext(): Context {
  return {
    chat: { id: 321 },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as Context;
}

describe("bot/commands/projects command", () => {
  beforeEach(() => {
    foregroundSessionState.__resetForTests();
    mocked.syncSessionDirectoryCacheMock.mockReset();
    mocked.getProjectsMock.mockReset();
    mocked.replyWithInlineMenuMock.mockReset();
  });

  it("blocks projects command while foreground session is busy", async () => {
    foregroundSessionState.markBusy("session-1");

    const ctx = createContext();
    await projectsCommand(ctx as never);

    expect(mocked.syncSessionDirectoryCacheMock).not.toHaveBeenCalled();
    expect(mocked.getProjectsMock).not.toHaveBeenCalled();
    expect(mocked.replyWithInlineMenuMock).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(t("interaction.blocked.finish_current"));
  });
});
