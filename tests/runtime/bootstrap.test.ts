import { describe, expect, it } from "vitest";
import { buildEnvFileContent, validateRuntimeEnvValues } from "../../src/runtime/bootstrap.js";

describe("runtime/bootstrap", () => {
  it("validates required runtime env values for DingTalk", () => {
    const result = validateRuntimeEnvValues({
      DINGTALK_APP_KEY: "ding-key",
      DINGTALK_APP_SECRET: "ding-secret",
      DINGTALK_ALLOWED_USER_ID: "staff-id",
      OPENCODE_MODEL_PROVIDER: "opencode",
      OPENCODE_MODEL_ID: "big-pickle",
    });

    expect(result).toEqual({ isValid: true });
  });

  it("fails validation when required model values are missing", () => {
    const result = validateRuntimeEnvValues({
      FEISHU_APP_ID: "cli_a1b2c3",
      FEISHU_APP_SECRET: "feishu-secret",
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("OPENCODE_MODEL_PROVIDER");
  });

  it("fails validation when no supported platform is configured", () => {
    const result = validateRuntimeEnvValues({
      OPENCODE_MODEL_PROVIDER: "opencode",
      OPENCODE_MODEL_ID: "big-pickle",
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("platform credentials");
  });

  it("updates only wizard keys and preserves custom keys", () => {
    const existingContent = [
      "CUSTOM_FLAG=enabled",
      "BOT_LOCALE=en",
      "OPENCODE_SERVER_USERNAME=old-user",
      "OPENCODE_SERVER_PASSWORD=old-password",
      "DINGTALK_APP_KEY=old-key",
      "DINGTALK_APP_SECRET=old-secret",
      "DINGTALK_ALLOWED_USER_ID=old-user-id",
      "OPENCODE_API_URL=http://localhost:4096",
      "OPENCODE_MODEL_PROVIDER=old-provider",
      "OPENCODE_MODEL_ID=old-model",
      "",
    ].join("\n");

    const updated = buildEnvFileContent(existingContent, {
      BOT_LOCALE: "ru",
      DINGTALK_APP_KEY: "new-key",
      DINGTALK_APP_SECRET: "new-secret",
      DINGTALK_ALLOWED_USER_ID: "new-user-id",
      OPENCODE_SERVER_USERNAME: "new-user",
      OPENCODE_MODEL_PROVIDER: "old-provider",
      OPENCODE_MODEL_ID: "old-model",
    });

    expect(updated).toContain("CUSTOM_FLAG=enabled");
    expect(updated).toContain("OPENCODE_SERVER_USERNAME=new-user");
    expect(updated).not.toContain("OPENCODE_SERVER_PASSWORD=");
    expect(updated).toContain("BOT_LOCALE=ru");
    expect(updated).toContain("DINGTALK_APP_KEY=new-key");
    expect(updated).toContain("DINGTALK_APP_SECRET=new-secret");
    expect(updated).toContain("DINGTALK_ALLOWED_USER_ID=new-user-id");
    expect(updated).not.toContain("OPENCODE_API_URL=");
    expect(updated).toContain("OPENCODE_MODEL_PROVIDER=old-provider");
    expect(updated).toContain("OPENCODE_MODEL_ID=old-model");
  });

  it("adds missing required model keys", () => {
    const updated = buildEnvFileContent("", {
      BOT_LOCALE: "en",
      FEISHU_APP_ID: "cli_123",
      FEISHU_APP_SECRET: "secret-123",
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: "secret",
      OPENCODE_MODEL_PROVIDER: "opencode",
      OPENCODE_MODEL_ID: "big-pickle",
      OPENCODE_API_URL: "https://localhost:4096",
    });

    expect(updated).toContain("BOT_LOCALE=en");
  expect(updated).toContain("FEISHU_APP_ID=cli_123");
  expect(updated).toContain("FEISHU_APP_SECRET=secret-123");
    expect(updated).toContain("OPENCODE_API_URL=https://localhost:4096");
    expect(updated).toContain("OPENCODE_SERVER_USERNAME=opencode");
    expect(updated).toContain("OPENCODE_SERVER_PASSWORD=secret");
    expect(updated).toContain("OPENCODE_MODEL_PROVIDER=opencode");
    expect(updated).toContain("OPENCODE_MODEL_ID=big-pickle");
  });

  it("removes server password when wizard value is empty", () => {
    const existingContent = [
      "OPENCODE_SERVER_USERNAME=old-user",
      "OPENCODE_SERVER_PASSWORD=old-password",
      "",
    ].join("\n");

    const updated = buildEnvFileContent(existingContent, {
      BOT_LOCALE: "en",
      FEISHU_APP_ID: "cli_456",
      FEISHU_APP_SECRET: "secret-456",
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_MODEL_PROVIDER: "opencode",
      OPENCODE_MODEL_ID: "big-pickle",
    });

    expect(updated).toContain("OPENCODE_SERVER_USERNAME=opencode");
    expect(updated).not.toContain("OPENCODE_SERVER_PASSWORD=");
  });
});
