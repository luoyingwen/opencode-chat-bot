import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exitMock: vi.fn(),
}));

describe("app/exit-app", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.useFakeTimers();
    mocked.exitMock.mockReset();
    mocked.exitMock.mockImplementation(() => undefined as never);
    process.exit = mocked.exitMock as typeof process.exit;
  });

  it("exits after delay", async () => {
    const { exitApplication } = await import("../../src/app/exit-app.js");
    await exitApplication("test");

    await vi.advanceTimersByTimeAsync(300);
    expect(mocked.exitMock).toHaveBeenCalledWith(0);
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.useRealTimers();
  });
});