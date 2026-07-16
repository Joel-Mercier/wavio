const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();
const mockPing = jest.fn();
const mockLogout = jest.fn();
// Controls the auto-sign-out setting read by disconnectUnreachable. Mutable so
// tests can toggle the opt-out; reset to the default (on) in beforeEach.
let mockAutoSignOut = true;
// Stands in for the global fetch used by the pre-logout internet corroboration.
let mockGlobalFetch: jest.Mock;

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

// Models one route probe. Tests drive it by resolving (the route answers) or
// rejecting (it doesn't). probeUrl itself never throws — it reports a boolean —
// so the adapter translates a rejection into `false`.
jest.mock("@/services/backend/probe", () => ({
  probeUrl: async (url: string) => {
    try {
      await mockPing(url);
      return true;
    } catch {
      return false;
    }
  },
}));

jest.mock("@/services/errorReporting", () => ({
  reportBreadcrumb: () => {},
  scrubUrl: (url: string) => url,
}));

// The saved server row behind the session. `fallbackUrl` is undefined by
// default, so the whole existing suite exercises the single-route case — which
// must behave exactly as it did before failover existed.
const mockServer: {
  id: string;
  url: string;
  fallbackUrl: string | undefined;
  type: string;
} = {
  id: "srv-1",
  url: "http://server.test",
  fallbackUrl: undefined,
  type: "navidrome",
};
jest.mock("@/stores/servers", () => ({
  useServersBase: {
    getState: () => ({
      getServerById: (id: string) =>
        id === mockServer.id ? mockServer : undefined,
    }),
  },
}));

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      autoSignOutOnServerUnreachable: mockAutoSignOut,
    }),
  },
}));

// The live session. `url` is mutable because failover repoints it — that swap is
// the observable the failover tests assert on.
const mockAuthState = {
  isAuthenticated: true,
  serverId: "srv-1",
  url: "http://server.test",
};
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      ...mockAuthState,
      logout: mockLogout,
      setActiveUrl: (url: string) => {
        mockAuthState.url = url;
      },
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
  probeServerPreferringPrimary,
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
  mockAutoSignOut = true;
  mockAuthState.isAuthenticated = true;
  mockAuthState.serverId = "srv-1";
  mockAuthState.url = "http://server.test";
  mockServer.url = "http://server.test";
  mockServer.fallbackUrl = undefined;
  // The pre-logout internet corroboration (probeInternetReachable) hits neutral
  // endpoints via global fetch. Default to "internet up" (any endpoint answers)
  // so the server-down path logs out; individual tests override to simulate a
  // dead/filtered link.
  mockGlobalFetch = jest.fn().mockResolvedValue({});
  (globalThis as { fetch: unknown }).fetch = mockGlobalFetch;
});

// Flush the microtask queue so the fire-and-forget async disconnectUnreachable
// (which awaits the internet check) runs to completion before assertions.
const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

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

  it("logs out after repeated probe failures when the internet is reachable", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    // Two failures is within the tolerance — no logout yet.
    expect(mockLogout).not.toHaveBeenCalled();
    await probeServer();
    // Third consecutive failure crosses the threshold; the internet check
    // confirms the wider internet is up (a neutral endpoint answers), so the
    // server specifically is gone → full logout.
    await flushMicrotasks();
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

describe("internet-corroborated logout", () => {
  it("keeps the session on a weak/restricted link where no endpoint answers (issue #41)", async () => {
    // The device link is attached (isConnected) but nothing actually routes —
    // both the server probe and every neutral internet endpoint fail.
    (mockGlobalFetch as jest.Mock).mockRejectedValue(new Error("ERR_NETWORK"));
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    await probeServer();
    // The internet check fails, so the link — not the server — is the problem:
    // stay signed in and unreachable (recovery poll keeps running).
    await flushMicrotasks();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(getServerReachable()).toBe(false);
  });

  it("does not depend on any single provider — one reachable endpoint is enough", async () => {
    // Simulate a region where most providers are blocked (reject) but one still
    // answers: the internet is up, so a dead server still logs out.
    (mockGlobalFetch as jest.Mock).mockImplementation((url: string) =>
      url.includes("ya.ru")
        ? Promise.resolve({})
        : Promise.reject(new Error("blocked")),
    );
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    await probeServer();
    await flushMicrotasks();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("does not log out on repeated failures when auto sign-out is disabled", async () => {
    mockAutoSignOut = false;
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    await probeServer();
    await probeServer();
    // Crossing the failure threshold surfaces the unreachable banner but keeps
    // the session alive when the user opted out of auto sign-out. The internet
    // check is skipped entirely.
    await flushMicrotasks();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(getServerReachable()).toBe(false);
    expect(mockGlobalFetch).not.toHaveBeenCalled();
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

const PRIMARY = "http://192.168.1.10:4533";
const FALLBACK = "https://music.example.com";

// Answers for `only`, fails for everything else.
const onlyReachable = (only: string) =>
  mockPing.mockImplementation((url: string) => {
    if (url === only) return Promise.resolve({});
    return Promise.reject(new Error("ERR_NETWORK"));
  });

describe("fallback URL failover", () => {
  beforeEach(() => {
    mockServer.url = PRIMARY;
    mockServer.fallbackUrl = FALLBACK;
    mockAuthState.url = PRIMARY;
  });

  it("never probes the fallback while the primary answers", async () => {
    await setDeviceOnline(true);
    mockPing.mockResolvedValue({});
    await probeServer();
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledWith(PRIMARY);
    expect(mockAuthState.url).toBe(PRIMARY);
  });

  it("swaps to the fallback when the primary stops answering", async () => {
    await setDeviceOnline(true);
    onlyReachable(FALLBACK);
    await probeServer();
    await flushMicrotasks();

    expect(mockAuthState.url).toBe(FALLBACK);
    // A round where *some* route answered is a success: no banner, no logout.
    expect(getServerReachable()).toBe(true);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("counts a round, not a ping — one dead route must not trip the banner", async () => {
    await setDeviceOnline(true);
    onlyReachable(FALLBACK);
    // Two rounds: four pings, two of which fail. Under per-ping counting this
    // would have passed FAILURES_BEFORE_UNREACHABLE and shown the banner.
    await probeServer();
    await probeServer();
    await flushMicrotasks();
    expect(getServerReachable()).toBe(true);
  });

  it("only reports unreachable once BOTH routes fail", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    await probeServer();
    expect(getServerReachable()).toBe(true); // first failed round: grace window
    await probeServer();
    await flushMicrotasks();
    expect(getServerReachable()).toBe(false);
  });

  it("only forces a sign-out once both routes have failed repeatedly", async () => {
    await setDeviceOnline(true);
    mockPing.mockRejectedValue(new Error("ERR_NETWORK"));
    for (let i = 0; i < 3; i++) {
      await probeServer();
      await flushMicrotasks();
    }
    expect(mockLogout).toHaveBeenCalled();
  });

  it("tries the active fallback first and leaves the primary alone", async () => {
    await setDeviceOnline(true);
    mockAuthState.url = FALLBACK;
    mockPing.mockResolvedValue({});
    await probeServer();
    // The steady heartbeat must not keep poking a LAN address that isn't there.
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledWith(FALLBACK);
  });

  it("returns to the primary when asked to prefer it", async () => {
    await setDeviceOnline(true);
    mockAuthState.url = FALLBACK;
    mockPing.mockResolvedValue({});
    await probeServer({ preferPrimary: true });
    expect(mockAuthState.url).toBe(PRIMARY);
  });

  it("stays on the fallback when a preferred primary is still unreachable", async () => {
    await setDeviceOnline(true);
    mockAuthState.url = FALLBACK;
    onlyReachable(FALLBACK);
    await probeServer({ preferPrimary: true });
    await flushMicrotasks();

    expect(mockAuthState.url).toBe(FALLBACK);
    // Coming home and finding the LAN absent is not a failure of anything.
    expect(getServerReachable()).toBe(true);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("throttles primary re-checks across a flurry of triggers", async () => {
    await setDeviceOnline(true);
    mockAuthState.url = FALLBACK;
    onlyReachable(FALLBACK);

    probeServerPreferringPrimary();
    await flushMicrotasks();
    const afterFirst = mockPing.mock.calls.length;
    // The first re-check tried [primary, fallback]; both were probed.
    expect(mockPing.mock.calls.map((c) => c[0])).toContain(PRIMARY);

    mockPing.mockClear();
    // A second trigger inside the throttle window (iOS fires `active` in
    // flurries) must not burn another primary timeout.
    probeServerPreferringPrimary();
    await flushMicrotasks();
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledWith(FALLBACK);
    expect(afterFirst).toBe(2);
  });

  it("still confirms the current route when the primary re-check is throttled", async () => {
    await setDeviceOnline(true);
    mockAuthState.url = FALLBACK;
    onlyReachable(FALLBACK);
    probeServerPreferringPrimary();
    await flushMicrotasks();

    mockPing.mockClear();
    probeServerPreferringPrimary();
    await flushMicrotasks();
    // Throttled means "don't reorder", not "don't probe".
    expect(getServerReachable()).toBe(true);
    expect(mockPing).toHaveBeenCalled();
  });
});
