const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();
const mockPing = jest.fn();
const mockLogout = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    // Lazy arrows so the hoisted factory defers reading the mock consts until
    // call time (avoids the TDZ); typed non-rest params keep both tsc and the
    // jest babel transform happy.
    fetch: () => mockFetch(),
    addEventListener: (cb: (state: unknown) => void) =>
      mockAddEventListener(cb),
  },
}));

jest.mock("@/services/backend/system", () => ({
  ping: (opts?: unknown) => mockPing(opts),
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      isAuthenticated: true,
      url: "http://server.test",
      logout: mockLogout,
    }),
    // network.ts subscribes to serverType changes; the tests don't exercise a
    // switch, so a no-op subscription that returns a no-op unsubscribe suffices.
    subscribe: () => () => {},
  },
}));

import {
  getConnectionType,
  getEffectiveMaxBitRate,
  getIsEffectivelyOnline,
  getIsOnline,
  getServerReachable,
  initConnectionType,
  probeServer,
  resetServerReachable,
  subscribeConnectionType,
} from "@/services/network";

// Mirror of OFFLINE_GRACE_MS in services/network.ts: the device-offline
// transition is debounced so a network handoff doesn't flash the offline UI.
const OFFLINE_GRACE_MS = 2500;

const setCurrentType = async (
  type: "wifi" | "cellular" | "unknown" | "none",
) => {
  let listener: ((state: { type: string }) => void) | null = null;
  mockAddEventListener.mockImplementation((cb) => {
    listener = cb;
    return () => {};
  });
  mockFetch.mockResolvedValueOnce({ type });
  const unsubscribe = initConnectionType();
  // Drain the fetch promise
  await Promise.resolve();
  await Promise.resolve();
  return {
    listener: listener as ((state: { type: string }) => void) | null,
    unsubscribe,
  };
};

beforeEach(() => {
  // Fake timers so the debounced offline transition (OFFLINE_GRACE_MS) is
  // controllable. Promise microtasks (await Promise.resolve()) still flush
  // normally, and the probe's internal abort/deadline timers never fire because
  // the mocked ping settles synchronously.
  jest.useFakeTimers();
  mockFetch.mockReset();
  mockAddEventListener.mockReset();
  mockPing.mockReset();
  mockLogout.mockReset();
});

afterEach(() => {
  // Stop any recovery poll / pending offline timer and return reachability to
  // the optimistic default so module-level state doesn't bleed between tests.
  resetServerReachable();
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Drives the connectivity singleton to a known device-online state and returns
// the captured NetInfo listener for further transitions.
const setDeviceOnline = async (isConnected: boolean) => {
  let listener:
    | ((state: { type: string; isConnected: boolean }) => void)
    | null = null;
  mockAddEventListener.mockImplementation((cb) => {
    listener = cb;
    return () => {};
  });
  mockFetch.mockResolvedValueOnce({ type: "wifi", isConnected });
  initConnectionType();
  await Promise.resolve();
  await Promise.resolve();
  const l = listener as
    | ((state: { type: string; isConnected: boolean }) => void)
    | null;
  // Force the desired state regardless of prior module state.
  l?.({ type: "wifi", isConnected });
  // Going offline is debounced — advance past the grace window so callers that
  // want a committed device-offline state get one.
  if (!isConnected) {
    jest.advanceTimersByTime(OFFLINE_GRACE_MS);
  }
  return l;
};

describe("getEffectiveMaxBitRate", () => {
  it("returns maxBitRate on wifi", async () => {
    await setCurrentType("wifi");
    expect(getEffectiveMaxBitRate(192, 96)).toBe(192);
    expect(getEffectiveMaxBitRate(null, 96)).toBeNull();
  });

  it("returns lower of the two on cellular", async () => {
    await setCurrentType("cellular");
    expect(getEffectiveMaxBitRate(320, 96)).toBe(96);
    expect(getEffectiveMaxBitRate(64, 128)).toBe(64);
  });

  it("falls back to whichever is set on cellular when only one is provided", async () => {
    await setCurrentType("cellular");
    expect(getEffectiveMaxBitRate(null, 128)).toBe(128);
    expect(getEffectiveMaxBitRate(192, null)).toBe(192);
    expect(getEffectiveMaxBitRate(null, null)).toBeNull();
  });
});

describe("connection type subscription", () => {
  it("getConnectionType reflects updates from NetInfo events", async () => {
    const { listener } = await setCurrentType("wifi");
    expect(getConnectionType()).toBe("wifi");
    listener?.({ type: "cellular" });
    expect(getConnectionType()).toBe("cellular");
  });

  it("subscribeConnectionType notifies on changes", async () => {
    const { listener } = await setCurrentType("wifi");
    const cb = jest.fn();
    const unsubscribe = subscribeConnectionType(cb);
    listener?.({ type: "cellular" });
    expect(cb).toHaveBeenCalledWith("cellular");
    cb.mockClear();
    listener?.({ type: "cellular" });
    expect(cb).not.toHaveBeenCalled();
    unsubscribe();
    listener?.({ type: "wifi" });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("server reachability probe", () => {
  it("tolerates the first failed probe, then marks unreachable on the second", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    // First failure is within the grace window (likely a not-yet-routable
    // network right after reconnect) — stay optimistically reachable.
    expect(getServerReachable()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
    await probeServer();
    // Second consecutive failure confirms the server is unreachable.
    expect(getServerReachable()).toBe(false);
    expect(getIsEffectivelyOnline()).toBe(false);
  });

  it("marks the server reachable again on a later successful probe", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    expect(getServerReachable()).toBe(false);
    mockPing.mockResolvedValueOnce({});
    await probeServer();
    expect(getServerReachable()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
  });

  it("does not flicker to unreachable on reconnect when the first probe fails", async () => {
    const listener = await setDeviceOnline(true);
    // Toggle airplane mode: drop offline (past the grace window), then back online.
    listener?.({ type: "wifi", isConnected: false });
    jest.advanceTimersByTime(OFFLINE_GRACE_MS);
    expect(getIsEffectivelyOnline()).toBe(false);
    // The probe fired right after reconnect fails because the network isn't
    // routable yet.
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    listener?.({ type: "wifi", isConnected: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Effective-online stays true through the grace window — no flicker to
    // "server unreachable" while the network settles.
    expect(getServerReachable()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
  });

  it("logs out after repeated probe failures while online", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    // Two failures is within the tolerance — no logout yet.
    expect(mockLogout).not.toHaveBeenCalled();
    await probeServer();
    // Third consecutive failure crosses the threshold → full logout.
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("does not log out if a probe succeeds before the threshold", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    // Recovery before the third failure resets the counter.
    mockPing.mockResolvedValueOnce({});
    await probeServer();
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does not probe while the device is offline", async () => {
    await setDeviceOnline(false);
    await probeServer();
    expect(mockPing).not.toHaveBeenCalled();
    // Device offline dominates the effective state regardless of reachability.
    expect(getIsEffectivelyOnline()).toBe(false);
  });

  it("resetServerReachable returns to the optimistic default", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    expect(getServerReachable()).toBe(false);
    resetServerReachable();
    expect(getServerReachable()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
  });
});

describe("network handoff grace period", () => {
  it("does not flash offline when connectivity returns within the grace window", async () => {
    const listener = await setDeviceOnline(true);
    // Transport handoff briefly reports disconnected before the new transport
    // attaches.
    listener?.({ type: "wifi", isConnected: false });
    // Still optimistically online partway through the grace window.
    jest.advanceTimersByTime(OFFLINE_GRACE_MS - 500);
    expect(getIsOnline()).toBe(true);
    // New transport (cellular) comes up before the window elapses.
    mockPing.mockResolvedValueOnce({});
    listener?.({ type: "cellular", isConnected: true });
    await Promise.resolve();
    await Promise.resolve();
    // Advancing past the original window must not commit offline — the pending
    // flip was cancelled when connectivity returned.
    jest.advanceTimersByTime(OFFLINE_GRACE_MS);
    expect(getIsOnline()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
  });

  it("commits offline if the device stays disconnected past the grace window", async () => {
    const listener = await setDeviceOnline(true);
    listener?.({ type: "none", isConnected: false });
    // Optimistically online during the grace window.
    expect(getIsOnline()).toBe(true);
    jest.advanceTimersByTime(OFFLINE_GRACE_MS);
    expect(getIsOnline()).toBe(false);
    expect(getIsEffectivelyOnline()).toBe(false);
  });

  it("re-probes the server on a transport change while online", async () => {
    const listener = await setDeviceOnline(true);
    expect(getConnectionType()).toBe("wifi");
    mockPing.mockClear();
    mockPing.mockResolvedValue({});
    listener?.({ type: "cellular", isConnected: true });
    // The handoff revalidates reachability immediately rather than waiting for
    // the heartbeat.
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it("does not re-probe on a type change while the device is offline", async () => {
    const listener = await setDeviceOnline(false);
    mockPing.mockClear();
    listener?.({ type: "cellular", isConnected: false });
    expect(mockPing).not.toHaveBeenCalled();
  });

  it("resetServerReachable cancels a pending offline flip", async () => {
    const listener = await setDeviceOnline(true);
    listener?.({ type: "wifi", isConnected: false });
    // Switch servers (or log out) mid-grace.
    resetServerReachable();
    jest.advanceTimersByTime(OFFLINE_GRACE_MS);
    // The pending flip was cancelled, so we never committed offline.
    expect(getIsOnline()).toBe(true);
  });
});
