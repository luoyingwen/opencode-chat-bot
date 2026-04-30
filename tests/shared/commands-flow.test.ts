import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  commandListMock: vi.fn(),
  sessionCommandMock: vi.fn(),
  getConversationStateMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    command: {
      list: mocked.commandListMock,
    },
    session: {
      command: mocked.sessionCommandMock,
    },
  },
}));

vi.mock("../../src/settings/manager.js", () => ({
  getConversationState: mocked.getConversationStateMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    error: mocked.loggerErrorMock,
    info: mocked.loggerInfoMock,
  },
}));

import {
  executeCommandByIndexForRoute,
  listCommandsForRoute,
} from "../../src/shared/commands-flow.js";

describe("shared commands flow", () => {
  beforeEach(() => {
    mocked.commandListMock.mockReset();
    mocked.sessionCommandMock.mockReset();
    mocked.getConversationStateMock.mockReset();
    mocked.loggerErrorMock.mockReset();
    mocked.loggerInfoMock.mockReset();

    mocked.getConversationStateMock.mockReturnValue({
      currentProject: {
        id: "project-1",
        name: "demo",
        worktree: "D:/repo",
      },
      currentSession: {
        id: "session-1",
        title: "Current Session",
        directory: "D:/repo",
      },
    });
    mocked.commandListMock.mockResolvedValue({
      data: [
        { name: "init", description: "guided AGENTS.md setup" },
        { name: "review", description: "review changes" },
        { name: "hackernews", description: "HN API" },
      ],
      error: undefined,
    });
    mocked.sessionCommandMock.mockResolvedValue({});
  });

  it("lists commands and tells the user to use /command <number>", async () => {
    const flowKey = "feishu:user-1:chat-1";
    const menu = await listCommandsForRoute(flowKey, flowKey);

    expect(menu).toContain("OpenCode Commands");
    expect(menu).toContain("/hackernews");
    expect(menu).toContain("/command <number>");
  });

  it("executes the selected command by explicit index", async () => {
    const flowKey = "feishu:user-1:chat-1";
    await listCommandsForRoute(flowKey, flowKey);

    const response = await executeCommandByIndexForRoute(flowKey, flowKey, "2", "branch main");

    expect(mocked.sessionCommandMock).toHaveBeenCalledWith({
      sessionID: "session-1",
      directory: "D:/repo",
      command: "review",
      arguments: "branch main",
    });
    expect(response).toContain("/review branch main");
  });
});