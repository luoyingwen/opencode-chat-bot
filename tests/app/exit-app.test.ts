import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isRunningMock: vi.fn(),
  getPidMock: vi.fn(),
  stopMock: vi.fn(),
  exitMock: vi.fn(),
}));

vi.mock("../../src/process/manager.js", () => ({
  processManager: {
    isRunning: mocked.isRunningMock,
    getPID: mocked.getPidMock,
    stop: mocked.stopMock,
  },
}));

describe("app/exit-app", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.useFakeTimers();
    mocked.isRunningMock.mockReset();
    mocked.getPidMock.mockReset();
    mocked.stopMock.mockReset();
    mocked.exitMock.mockReset();
    mocked.exitMock.mockImplementation(() => undefined as never);
    process.exit = mocked.exitMock as typeof process.exit;
  });

  it("stops managed process before exiting", async () => {
    mocked.isRunningMock.mockReturnValue(true);
    mocked.getPidMock.mockReturnValue(1234);
    mocked.stopMock.mockResolvedValue({ success: true });

    const { exitApplication } = await import("../../src/app/exit-app.js");
    await exitApplication("test");

    expect(mocked.stopMock).toHaveBeenCalledWith(5000);

    await vi.advanceTimersByTimeAsync(300);
    expect(mocked.exitMock).toHaveBeenCalledWith(0);
  });

  it("exits even when no managed process is running", async () => {
    mocked.isRunningMock.mockReturnValue(false);

    const { exitApplication } = await import("../../src/app/exit-app.js");
    await exitApplication("test");

    expect(mocked.stopMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(mocked.exitMock).toHaveBeenCalledWith(0);
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.useRealTimers();
  });
});
