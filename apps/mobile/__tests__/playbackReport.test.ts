const mockReportPlayback = jest.fn(() => Promise.resolve());
let mockReachable = true;
const mockListeners = new Set<() => void>();

jest.mock("@/services/backend/mediaAnnotation", () => ({
  reportPlayback: (...args: unknown[]) => mockReportPlayback(...(args as [])),
}));

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockReachable,
  subscribeEffectiveOnline: (cb: () => void) => {
    mockListeners.add(cb);
    return () => mockListeners.delete(cb);
  },
}));

jest.mock("@/stores/serverExtensions", () => ({
  useServerExtensionsBase: {
    getState: () => ({ hasExtension: () => true }),
  },
}));

function setReachable(value: boolean) {
  mockReachable = value;
  for (const cb of mockListeners) cb();
}

function load() {
  jest.resetModules();
  mockListeners.clear();
  return require("@/services/playbackReport") as typeof import("@/services/playbackReport");
}

const sentStates = () =>
  mockReportPlayback.mock.calls.map(
    (call) => (call as unknown as [{ state: string }])[0].state,
  );

beforeEach(() => {
  jest.useFakeTimers();
  mockReportPlayback.mockClear();
  mockReachable = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("playbackReport", () => {
  it("reports the lifecycle while the server is reachable", () => {
    const report = load();
    report.reportStarting("a");
    jest.advanceTimersByTime(2_000);
    report.reportProgress(2_000);
    report.reportPaused(3_000);
    report.reportStopped();

    expect(sentStates()).toEqual(["starting", "playing", "paused", "stopped"]);
  });

  it("sends nothing while the server is unreachable", () => {
    mockReachable = false;
    const report = load();
    report.reportStarting("a");
    jest.advanceTimersByTime(2_000);
    report.reportProgress(2_000);
    report.reportStopped();
    report.reportStarting("b");

    expect(mockReportPlayback).not.toHaveBeenCalled();
  });

  it("re-announces the current track once the server is back", () => {
    mockReachable = false;
    const report = load();
    report.reportStarting("a");
    jest.advanceTimersByTime(2_000);
    report.reportProgress(12_000);

    setReachable(true);
    setReachable(true);

    expect(mockReportPlayback).toHaveBeenCalledTimes(1);
    expect(mockReportPlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: "a",
        state: "playing",
        positionMs: 12_000,
      }),
    );
  });

  it("has nothing to re-announce once the track was stopped", () => {
    mockReachable = false;
    const report = load();
    report.reportStarting("a");
    report.reportStopped();

    setReachable(true);

    expect(mockReportPlayback).not.toHaveBeenCalled();
  });
});
