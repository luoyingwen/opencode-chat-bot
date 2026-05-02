import { describe, expect, it, beforeEach } from "vitest";

import {
  isAutoConfirmEnabled,
  setAutoConfirm,
  clearAutoConfirm,
  getAutoConfirmSessions,
  __resetAutoConfirmForTests,
} from "../../src/permission/auto-confirm.js";

describe("auto-confirm", () => {
  beforeEach(() => {
    __resetAutoConfirmForTests();
  });

  it("defaults to disabled for unknown sessions", () => {
    expect(isAutoConfirmEnabled("unknown-session")).toBe(false);
  });

  it("can be enabled for a session", () => {
    setAutoConfirm("session-1", true);
    expect(isAutoConfirmEnabled("session-1")).toBe(true);
  });

  it("can be disabled for a session", () => {
    setAutoConfirm("session-1", true);
    expect(isAutoConfirmEnabled("session-1")).toBe(true);

    setAutoConfirm("session-1", false);
    expect(isAutoConfirmEnabled("session-1")).toBe(false);
  });

  it("can be cleared for a session", () => {
    setAutoConfirm("session-1", true);
    expect(isAutoConfirmEnabled("session-1")).toBe(true);

    clearAutoConfirm("session-1");
    expect(isAutoConfirmEnabled("session-1")).toBe(false);
  });

  it("tracks multiple sessions independently", () => {
    setAutoConfirm("session-1", true);
    setAutoConfirm("session-2", false);
    setAutoConfirm("session-3", true);

    expect(isAutoConfirmEnabled("session-1")).toBe(true);
    expect(isAutoConfirmEnabled("session-2")).toBe(false);
    expect(isAutoConfirmEnabled("session-3")).toBe(true);
  });

  it("returns all enabled sessions", () => {
    setAutoConfirm("session-1", true);
    setAutoConfirm("session-2", false);
    setAutoConfirm("session-3", true);

    const enabled = getAutoConfirmSessions();
    expect(enabled).toContain("session-1");
    expect(enabled).toContain("session-3");
    expect(enabled).not.toContain("session-2");
  });
});