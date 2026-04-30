import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  let currentProject:
    | {
        id: string;
        worktree: string;
        name: string;
      }
    | undefined;
  let currentSession:
    | {
        id: string;
        directory: string;
        title: string;
      }
    | undefined;
  let currentAgent: string | undefined;
  const conversationStates: Record<
    string,
    {
      currentProject?: { id: string; worktree: string; name: string };
      currentSession?: { id: string; directory: string; title: string };
      currentAgent?: string;
    }
  > = {};

  const appAgentsMock = vi.fn();
  const sessionMessagesMock = vi.fn();
  const getCurrentProjectMock = vi.fn(() => currentProject);
  const getCurrentSessionMock = vi.fn(() => currentSession);
  const getCurrentAgentMock = vi.fn(() => currentAgent);
  const getConversationStateMock = vi.fn((routeKey: string) => conversationStates[routeKey]);
  const updateConversationStateMock = vi.fn(
    (
      routeKey: string,
      patch: {
        currentProject?: { id: string; worktree: string; name: string } | null;
        currentSession?: { id: string; directory: string; title: string } | null;
        currentAgent?: string | null;
      },
    ) => {
      const nextState = { ...(conversationStates[routeKey] ?? {}) };
      if (Object.prototype.hasOwnProperty.call(patch, "currentProject")) {
        nextState.currentProject = patch.currentProject ?? undefined;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "currentSession")) {
        nextState.currentSession = patch.currentSession ?? undefined;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "currentAgent")) {
        nextState.currentAgent = patch.currentAgent ?? undefined;
      }
      conversationStates[routeKey] = nextState;
      return nextState;
    },
  );
  const setCurrentAgentMock = vi.fn((agentName: string) => {
    currentAgent = agentName;
  });

  return {
    appAgentsMock,
    sessionMessagesMock,
    getCurrentProjectMock,
    getCurrentSessionMock,
    getCurrentAgentMock,
    getConversationStateMock,
    updateConversationStateMock,
    setCurrentAgentMock,
    loggerDebugMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    setCurrentProject: (project?: { id: string; worktree: string; name: string }) => {
      currentProject = project;
    },
    setCurrentSession: (session?: { id: string; directory: string; title: string }) => {
      currentSession = session;
    },
    setCurrentAgent: (agentName?: string) => {
      currentAgent = agentName;
    },
    resetConversationStates: () => {
      for (const key of Object.keys(conversationStates)) {
        delete conversationStates[key];
      }
    },
    setConversationState: (
      routeKey: string,
      state: {
        currentProject?: { id: string; worktree: string; name: string };
        currentSession?: { id: string; directory: string; title: string };
        currentAgent?: string;
      },
    ) => {
      conversationStates[routeKey] = state;
    },
  };
});

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    app: {
      agents: mocked.appAgentsMock,
    },
    session: {
      messages: mocked.sessionMessagesMock,
    },
  },
}));

vi.mock("../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProjectMock,
  getCurrentAgent: mocked.getCurrentAgentMock,
  getConversationState: mocked.getConversationStateMock,
  setCurrentAgent: mocked.setCurrentAgentMock,
  updateConversationState: mocked.updateConversationStateMock,
}));

vi.mock("../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getCurrentSessionMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    debug: mocked.loggerDebugMock,
    error: mocked.loggerErrorMock,
    info: mocked.loggerInfoMock,
    warn: mocked.loggerWarnMock,
  },
}));

import {
  fetchCurrentAgent,
  getAvailableAgents,
  getStoredAgent,
  resolveProjectAgent,
  selectAgent,
} from "../../src/agent/manager.js";

function createAgentResponse(
  agents: Array<{ name: string; mode: "primary" | "all" | "subagent"; hidden?: boolean }>,
) {
  return {
    data: agents,
    error: null,
  };
}

describe("agent/manager", () => {
  beforeEach(() => {
    mocked.appAgentsMock.mockReset();
    mocked.sessionMessagesMock.mockReset();
    mocked.getCurrentProjectMock.mockClear();
    mocked.getCurrentSessionMock.mockClear();
    mocked.getCurrentAgentMock.mockClear();
    mocked.getConversationStateMock.mockClear();
    mocked.updateConversationStateMock.mockClear();
    mocked.setCurrentAgentMock.mockClear();
    mocked.loggerDebugMock.mockReset();
    mocked.loggerErrorMock.mockReset();
    mocked.loggerInfoMock.mockReset();
    mocked.loggerWarnMock.mockReset();
    mocked.setCurrentProject(undefined);
    mocked.setCurrentSession(undefined);
    mocked.setCurrentAgent(undefined);
    mocked.resetConversationStates();
  });

  it("filters out hidden agents and subagents", async () => {
    mocked.setCurrentProject({
      id: "project-1",
      worktree: "/workspace/project-1",
      name: "project-1",
    });
    mocked.appAgentsMock.mockResolvedValue(
      createAgentResponse([
        { name: "orchestrator", mode: "primary" },
        { name: "build", mode: "primary" },
        { name: "summary", mode: "primary", hidden: true },
        { name: "general", mode: "subagent" },
      ]),
    );

    const result = await getAvailableAgents();

    expect(result).toEqual([
      { name: "orchestrator", mode: "primary" },
      { name: "build", mode: "primary" },
    ]);
  });

  it("falls back to build when the preferred agent is unavailable in the project", async () => {
    mocked.setCurrentProject({
      id: "project-1",
      worktree: "/workspace/project-1",
      name: "project-1",
    });
    mocked.setCurrentAgent("orchestrator");
    mocked.appAgentsMock.mockResolvedValue(
      createAgentResponse([
        { name: "build", mode: "primary" },
        { name: "plan", mode: "primary" },
      ]),
    );

    const result = await resolveProjectAgent("orchestrator");

    expect(result).toBe("build");
    expect(mocked.setCurrentAgentMock).toHaveBeenCalledWith("build");
    expect(mocked.loggerWarnMock).toHaveBeenCalledOnce();
  });

  it("falls back to the first available agent when build is unavailable", async () => {
    mocked.setCurrentProject({
      id: "project-2",
      worktree: "/workspace/project-2",
      name: "project-2",
    });
    mocked.appAgentsMock.mockResolvedValue(
      createAgentResponse([
        { name: "plan", mode: "primary" },
        { name: "orchestrator", mode: "primary" },
      ]),
    );

    const result = await resolveProjectAgent("build");

    expect(result).toBe("plan");
    expect(mocked.setCurrentAgentMock).toHaveBeenCalledWith("plan");
  });

  it("normalizes an invalid stored agent when there is an active project without a session", async () => {
    mocked.setCurrentProject({
      id: "project-3",
      worktree: "/workspace/project-3",
      name: "project-3",
    });
    mocked.setCurrentAgent("orchestrator");
    mocked.appAgentsMock.mockResolvedValue(
      createAgentResponse([
        { name: "build", mode: "primary" },
        { name: "plan", mode: "primary" },
      ]),
    );

    const result = await fetchCurrentAgent();

    expect(result).toBe("build");
    expect(mocked.setCurrentAgentMock).toHaveBeenCalledWith("build");
    expect(mocked.sessionMessagesMock).not.toHaveBeenCalled();
  });

  it("reads and writes agent state for the provided route", async () => {
    const route = { channelId: "feishu", accountId: "user-1", conversationId: "chat-1" };
    mocked.setConversationState("feishu:user-1:chat-1", {
      currentProject: {
        id: "project-1",
        worktree: "/workspace/project-1",
        name: "project-1",
      },
      currentAgent: "orchestrator",
    });
    mocked.appAgentsMock.mockResolvedValue(
      createAgentResponse([
        { name: "build", mode: "primary" },
        { name: "plan", mode: "primary" },
      ]),
    );

    expect(getStoredAgent(route)).toBe("orchestrator");

    const resolved = await resolveProjectAgent(undefined, route);
    expect(resolved).toBe("build");

    selectAgent("plan", route);
    expect(mocked.updateConversationStateMock).toHaveBeenCalledWith(
      "feishu:user-1:chat-1",
      { currentAgent: "plan" },
    );
  });
});
