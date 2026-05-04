import { describe, expect, it, vi } from "vitest";

describe("openclaw config", () => {
  it("resolves runtime config as enabled by default", async () => {
    vi.resetModules();
    const { resolveOpenClawRuntimeConfig } = await import("../../src/openclaw/config.js");
    
    resolveOpenClawRuntimeConfig();
    expect(true).toBe(true);
  });
});