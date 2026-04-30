import { beforeEach, describe, expect, it } from "vitest";

import { settingsConversationRuntime } from "../../src/core/runtime/settings-runtime.js";
import {
  __resetSettingsForTests,
  getCurrentProject,
  getCurrentSession,
} from "../../src/settings/manager.js";

describe("settings conversation runtime", () => {
  beforeEach(() => {
    __resetSettingsForTests();
  });

  it("stores conversation state per route key", async () => {
    const dingTalkRoute = { channelId: "dingtalk", accountId: "user-1" };
    const feishuRoute = { channelId: "feishu", accountId: "user-1", conversationId: "chat-1" };

    await settingsConversationRuntime.update(dingTalkRoute, {
      currentProject: { id: "project-a", worktree: "/repo/a", name: "Repo A" },
      currentSession: { id: "session-a", title: "Session A", directory: "/repo/a" },
    });

    await settingsConversationRuntime.update(feishuRoute, {
      currentProject: { id: "project-b", worktree: "/repo/b", name: "Repo B" },
      currentSession: { id: "session-b", title: "Session B", directory: "/repo/b" },
    });

    await expect(settingsConversationRuntime.get(dingTalkRoute)).resolves.toMatchObject({
      currentProject: { id: "project-a", worktree: "/repo/a" },
      currentSession: { id: "session-a", directory: "/repo/a" },
    });
    await expect(settingsConversationRuntime.get(feishuRoute)).resolves.toMatchObject({
      currentProject: { id: "project-b", worktree: "/repo/b" },
      currentSession: { id: "session-b", directory: "/repo/b" },
    });
  });

  it("keeps legacy getters mapped to the default route", async () => {
    await settingsConversationRuntime.update({}, {
      currentProject: { id: "project-default", worktree: "/repo/default", name: "Default" },
      currentSession: {
        id: "session-default",
        title: "Default Session",
        directory: "/repo/default",
      },
    });

    expect(getCurrentProject()).toMatchObject({ id: "project-default", worktree: "/repo/default" });
    expect(getCurrentSession()).toMatchObject({ id: "session-default", directory: "/repo/default" });
  });
});