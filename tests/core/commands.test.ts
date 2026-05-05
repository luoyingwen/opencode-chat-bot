import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    fetchCurrentAgentMock: vi.fn(),
    fetchCurrentModelMock: vi.fn(),
    getModelSelectionListsMock: vi.fn(),
    ingestSessionInfoForCacheMock: vi.fn(async () => undefined),
    isAutoConfirmEnabledMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  };
});

vi.mock("../../src/agent/manager.js", () => ({
  fetchCurrentAgent: mocked.fetchCurrentAgentMock,
}));

vi.mock("../../src/model/manager.js", () => ({
  fetchCurrentModel: mocked.fetchCurrentModelMock,
  getModelSelectionLists: mocked.getModelSelectionListsMock,
}));

vi.mock("../../src/session/cache-manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/session/cache-manager.js")>();
  return {
    ...actual,
    ingestSessionInfoForCache: mocked.ingestSessionInfoForCacheMock,
  };
});

vi.mock("../../src/permission/auto-confirm.js", () => ({
  isAutoConfirmEnabled: mocked.isAutoConfirmEnabledMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    error: mocked.loggerErrorMock,
  },
}));

import { ProjectCommandHandler } from "../../src/core/commands/project.js";
import { ProjectsCommandHandler } from "../../src/core/commands/projects.js";
import { ModelCommandHandler } from "../../src/core/commands/model.js";
import { ModelsCommandHandler } from "../../src/core/commands/models.js";
import { SessionCommandHandler } from "../../src/core/commands/session.js";
import { SessionsCommandHandler } from "../../src/core/commands/sessions.js";
import { StatusCommandHandler } from "../../src/core/commands/status.js";
import { StopCommandHandler } from "../../src/core/commands/stop.js";
import type { CommandContext } from "../../src/core/commands/types.js";

function createContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    route: { channelId: "test", accountId: "user-1" },
    userId: "user-1",
    locale: "en",
    command: { name: "status", args: "", rawText: "/status" },
    runtime: {
      getRouteKey: vi.fn(() => "test:user-1"),
      get: vi.fn(async () => ({
        routeKey: "test:user-1",
        currentProject: { id: "project-1", worktree: "/workspace/demo", name: "demo" },
        currentSession: {
          id: "session-1",
          title: "Current Session",
          directory: "/workspace/demo",
        },
      })),
      update: vi.fn(async () => ({ routeKey: "test:user-1" })),
      clear: vi.fn(async () => undefined),
    },
    gateway: {
      health: vi.fn(async () => ({ healthy: true, version: "1.2.3" })),
      listProjects: vi.fn(async () => []),
      ensureProjectByPath: vi.fn(),
      createSession: vi.fn(),
      listSessions: vi.fn(async () => []),
      getSession: vi.fn(),
      abortSession: vi.fn(),
      getSessionStatus: vi.fn(async () => ({ "session-1": { type: "idle" } })),
    },
    projectsListLimit: 10,
    ...overrides,
  };
}

describe("core commands", () => {
  beforeEach(() => {
    mocked.fetchCurrentAgentMock.mockReset();
    mocked.fetchCurrentModelMock.mockReset();
    mocked.getModelSelectionListsMock.mockReset();
    mocked.ingestSessionInfoForCacheMock.mockReset();
    mocked.isAutoConfirmEnabledMock.mockReset();
    mocked.loggerErrorMock.mockReset();
  });

  it("builds status output from shared services", async () => {
    mocked.fetchCurrentAgentMock.mockResolvedValue("build");
    mocked.fetchCurrentModelMock.mockReturnValue({ providerID: "openai", modelID: "gpt-5" });
    mocked.isAutoConfirmEnabledMock.mockReturnValue(true);

    const handler = new StatusCommandHandler();
    const result = await handler.handle(createContext());

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].text).toContain("# OpenCode Status");
    expect(result.outputs[0].text).toContain("**Health:** ✅ Healthy");
    expect(result.outputs[0].text).toContain("**Agent:** 🛠️ Build");
    expect(result.outputs[0].text).toContain("**Model:** openai / gpt-5");
    expect(result.outputs[0].text).toContain("**Auto_confirm:** ✅ ON");
    expect(mocked.fetchCurrentAgentMock).toHaveBeenCalledWith({
      channelId: "test",
      accountId: "user-1",
    });
    expect(mocked.fetchCurrentModelMock).toHaveBeenCalledWith({
      channelId: "test",
      accountId: "user-1",
    });
    expect(mocked.isAutoConfirmEnabledMock).toHaveBeenCalledWith("session-1");
  });

  it("shows the selected route model in status even when a session is active", async () => {
    mocked.fetchCurrentAgentMock.mockResolvedValue("build");
    mocked.fetchCurrentModelMock.mockReturnValue({
      providerID: "deepseek",
      modelID: "deepseek-v4-flash",
    });
    mocked.isAutoConfirmEnabledMock.mockReturnValue(false);

    const handler = new StatusCommandHandler();
    const result = await handler.handle(createContext());

    expect(result.outputs[0].text).toContain("**Model:** deepseek / deepseek-v4-flash");
  });

  it("formats project list with active project marker", async () => {
    const listProjects = vi.fn(async () => [
      { id: "project-1", worktree: "/workspace/demo", name: "demo" },
      { id: "project-2", worktree: "/workspace/other", name: "other" },
    ]);

    const baseContext = createContext();
    const handler = new ProjectsCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "projects", args: "", rawText: "/projects" },
      gateway: {
        ...baseContext.gateway,
        listProjects,
      },
    });

    expect(result.outputs[0].text).toContain("# Projects (2/2)");
    expect(result.outputs[0].text).toContain("1. **demo** ✅");
    expect(result.outputs[0].text).toContain("Use `/project <number>` to select a project.");
  });

  it("selects project by index and clears current session", async () => {
    const update = vi.fn(async () => ({ routeKey: "test:user-1" }));
    const baseContext = createContext();
    const handler = new ProjectCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "project", args: "1", rawText: "/project 1" },
      runtime: {
        getRouteKey: vi.fn(() => "test:user-1"),
        get: vi.fn(async () => ({ routeKey: "test:user-1" })),
        update,
        clear: vi.fn(async () => undefined),
      },
      gateway: {
        ...baseContext.gateway,
        listProjects: vi.fn(async () => [
          { id: "project-1", worktree: "/workspace/demo", name: "demo" },
        ]),
      },
    });

    expect(update).toHaveBeenCalledWith(
      { channelId: "test", accountId: "user-1" },
      {
        currentProject: { id: "project-1", worktree: "/workspace/demo", name: "demo" },
        currentSession: null,
      },
    );
    expect(result.effects).toEqual({ projectChanged: true });
    expect(result.outputs[0].text).toContain("✅ Project selected");
  });

  it("formats model list with active model marker", async () => {
    mocked.fetchCurrentModelMock.mockReturnValue({ providerID: "openai", modelID: "gpt-5" });
    mocked.getModelSelectionListsMock.mockResolvedValue({
      favorites: [
        { providerID: "openai", modelID: "gpt-5" },
        { providerID: "anthropic", modelID: "claude-sonnet" },
      ],
      recent: [{ providerID: "google", modelID: "gemini-pro" }],
    });

    const handler = new ModelsCommandHandler();
    const result = await handler.handle(
      createContext({ command: { name: "models", args: "", rawText: "/models" } }),
    );

    expect(result.outputs[0].text).toContain("# Models (3)");
    expect(result.outputs[0].text).toContain("1. **openai/gpt-5** ✅");
    expect(result.outputs[0].text).toContain("3. **google/gemini-pro**");
    expect(result.outputs[0].text).toContain("Use `/model <number>` to select a model.");
  });

  it("selects model by index", async () => {
    const update = vi.fn(async () => ({ routeKey: "test:user-1" }));
    mocked.getModelSelectionListsMock.mockResolvedValue({
      favorites: [{ providerID: "openai", modelID: "gpt-5" }],
      recent: [{ providerID: "anthropic", modelID: "claude-sonnet" }],
    });

    const handler = new ModelCommandHandler();
    const result = await handler.handle({
      ...createContext(),
      command: { name: "model", args: "2", rawText: "/model 2" },
      runtime: {
        getRouteKey: vi.fn(() => "test:user-1"),
        get: vi.fn(async () => ({ routeKey: "test:user-1" })),
        update,
        clear: vi.fn(async () => undefined),
      },
    });

    expect(update).toHaveBeenCalledWith(
      { channelId: "test", accountId: "user-1" },
      {
        currentModel: {
          providerID: "anthropic",
          modelID: "claude-sonnet",
          variant: "default",
        },
      },
    );
    expect(result.effects).toEqual({ modelChanged: true });
    expect(result.outputs[0].text).toContain("✅ Model selected");
  });

  it("creates a session through the shared session new command", async () => {
    const update = vi.fn(async () => ({ routeKey: "test:user-1" }));
    const baseContext = createContext();
    const handler = new SessionCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "session", args: "new", rawText: "/session new" },
      runtime: {
        getRouteKey: vi.fn(() => "test:user-1"),
        get: vi.fn(async () => ({
          routeKey: "test:user-1",
          currentProject: { id: "project-1", worktree: "/workspace/demo", name: "demo" },
        })),
        update,
        clear: vi.fn(async () => undefined),
      },
      gateway: {
        ...baseContext.gateway,
        createSession: vi.fn(async () => ({
          id: "session-2",
          title: "New Session",
          directory: "/workspace/demo",
        })),
      },
    });

    expect(update).toHaveBeenCalledWith(
      { channelId: "test", accountId: "user-1" },
      {
        currentSession: {
          id: "session-2",
          title: "New Session",
          directory: "/workspace/demo",
        },
      },
    );
    expect(result.effects).toEqual({ sessionChanged: true });
  });

  it("lists sessions with the active marker from runtime state", async () => {
    const baseContext = createContext();
    const handler = new SessionsCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "sessions", args: "", rawText: "/sessions" },
      gateway: {
        ...baseContext.gateway,
        listSessions: vi.fn(async () => [
          { id: "session-2", title: "Older", directory: "/workspace/demo", time: { updated: 10 } },
          {
            id: "session-1",
            title: "Current Session",
            directory: "/workspace/demo",
            time: { updated: 20 },
          },
        ]),
      },
    });

    expect(result.outputs[0].text).toContain("1. **Current Session** ✅");
    expect(result.outputs[0].text).toContain("2. **Older**");
  });

  it("selects a session by index through the shared session command", async () => {
    const update = vi.fn(async () => ({ routeKey: "test:user-1" }));
    const baseContext = createContext();
    const handler = new SessionCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "session", args: "1", rawText: "/session 1" },
      runtime: {
        getRouteKey: vi.fn(() => "test:user-1"),
        get: vi.fn(async () => ({
          routeKey: "test:user-1",
          currentProject: { id: "project-1", worktree: "/workspace/demo", name: "demo" },
        })),
        update,
        clear: vi.fn(async () => undefined),
      },
      gateway: {
        ...baseContext.gateway,
        listSessions: vi.fn(async () => [
          { id: "session-9", title: "Chosen", directory: "/workspace/demo", time: { updated: 20 } },
        ]),
        getSession: vi.fn(async () => ({
          id: "session-9",
          title: "Chosen",
          directory: "/workspace/demo",
        })),
      },
    });

    expect(update).toHaveBeenCalledWith(
      { channelId: "test", accountId: "user-1" },
      {
        currentSession: {
          id: "session-9",
          title: "Chosen",
          directory: "/workspace/demo",
        },
      },
    );
    expect(result.effects).toEqual({ sessionChanged: true });
  });

  it("stops the active session through the shared stop command", async () => {
    const baseContext = createContext();
    const abortSession = vi.fn(async () => ({ error: null }));
    const handler = new StopCommandHandler();
    const result = await handler.handle({
      ...baseContext,
      command: { name: "stop", args: "", rawText: "/stop" },
      gateway: {
        ...baseContext.gateway,
        abortSession,
      },
    });

    expect(abortSession).toHaveBeenCalledWith({
      sessionID: "session-1",
      directory: "/workspace/demo",
      signal: expect.any(AbortSignal),
    });
    expect(result.outputs[0].text).toContain("✅ Session stopped.");
  });
});
