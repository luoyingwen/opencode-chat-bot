import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadOpenClawConfigModule() {
  vi.resetModules();
  vi.stubEnv("OPENCODE_MODEL_PROVIDER", "test-provider");
  vi.stubEnv("OPENCODE_MODEL_ID", "test-model");
  return import("../../src/openclaw/config.js");
}

describe("openclaw config", () => {
  beforeEach(() => {
    vi.stubEnv("OPENCLAW_ENABLED", "");
    vi.stubEnv("OPENCLAW_CHANNELS", "");
    vi.stubEnv("OPENCLAW_ACCOUNT_IDS", "");
    vi.stubEnv("OPENCLAW_CONVERSATION_IDS", "");
  });

  it("reads plugin config arrays and enabled flag", async () => {
    const { readOpenClawPluginConfig } = await loadOpenClawConfigModule();

    const pluginConfig = readOpenClawPluginConfig({
      enabled: true,
      channels: ["Telegram", " discord "],
      accountIds: ["Account-A"],
      conversationIds: ["Conv-1"],
    });

    expect(pluginConfig).toEqual({
      enabled: true,
      channels: ["telegram", "discord"],
      accountIds: ["account-a"],
      conversationIds: ["conv-1"],
    });
  });

  it("lets plugin config override env config", async () => {
    vi.stubEnv("OPENCLAW_ENABLED", "false");
    vi.stubEnv("OPENCLAW_CHANNELS", "telegram");
    const { resolveOpenClawRuntimeConfig } = await loadOpenClawConfigModule();

    const runtimeConfig = resolveOpenClawRuntimeConfig({
      enabled: true,
      channels: ["discord"],
    });

    expect(runtimeConfig.enabled).toBe(true);
    expect(runtimeConfig.channels).toEqual(["discord"]);
  });

  it("matches scope filters case-insensitively", async () => {
    const { matchesOpenClawScope } = await loadOpenClawConfigModule();

    expect(
      matchesOpenClawScope(
        {
          enabled: true,
          channels: ["telegram"],
          accountIds: ["account-a"],
          conversationIds: ["conv-1"],
        },
        { channelId: "Telegram", accountId: "Account-A", conversationId: "Conv-1" },
      ),
    ).toBe(true);
  });
});
