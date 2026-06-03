const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();
const mockPing = jest.fn();
const mockLogout = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockFetch(...args),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

jest.mock("@/services/backend/system", () => ({
  ping: (...args: unknown[]) => mockPing(...args),
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      isAuthenticated: true,
      url: "http://server.test",
      logout: mockLogout,
    }),
  },
}));

import {
  getConnectionType,
  getEffectiveMaxBitRate,
  getIsEffectivelyOnline,
  getServerReachable,
  initConnectionType,
  probeServer,
  resetServerReachable,
  subscribeConnectionType,
} from "@/services/network";

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
  mockFetch.mockReset();
  mockAddEventListener.mockReset();
  mockPing.mockReset();
  mockLogout.mockReset();
});

afterEach(() => {
  // Stop any recovery poll and return reachability to the optimistic default so
  // module-level state doesn't bleed between tests.
  resetServerReachable();
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
  it("marks the server unreachable when the probe fails", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    expect(getServerReachable()).toBe(false);
    // Device is online but the server isn't reachable → not effectively online.
    expect(getIsEffectivelyOnline()).toBe(false);
  });

  it("marks the server reachable again on a later successful probe", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    expect(getServerReachable()).toBe(false);
    mockPing.mockResolvedValueOnce({});
    await probeServer();
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
    mockPing.mockRejectedValueOnce(new Error("ERR_NETWORK"));
    await probeServer();
    expect(getServerReachable()).toBe(false);
    resetServerReachable();
    expect(getServerReachable()).toBe(true);
    expect(getIsEffectivelyOnline()).toBe(true);
  });
});
