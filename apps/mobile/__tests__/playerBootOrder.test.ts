// The release bundle reaches player.ts through targets.ts (index.js → car
// session / lock-screen mirror → targets → cast → player), so player.ts runs
// its module body while targets.ts is still mid-evaluation. Anything player.ts
// calls at module scope must not come from targets.ts (issue #237 build crashed
// on launch with "Cannot read property 'subscribeRemoteChange' of undefined").
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    createThrottledScopedJSONStorage: () =>
      jest.requireActual("zustand/middleware").createJSONStorage(() => make()),
    flushPendingScopedWrites: () => {},
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      url: "https://server",
      username: "n",
      serverId: "s1",
      serverType: "opensubsonic",
    }),
    subscribe: jest.fn(() => jest.fn()),
  },
  registerLogoutHandler: jest.fn(),
  currentAuthScope: () => "scope",
}));

const mockIsOnline = jest.fn(() => true);
jest.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => mockIsOnline() },
}));

jest.mock("@/config/queryClient", () => ({
  queryClient: {
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    setQueriesData: jest.fn(),
    invalidateQueries: jest.fn(),
  },
}));

// The player is created at services/player.ts module scope — before this file's
// own consts initialize — so the shared instance is parked on globalThis for the
// tests to drive rather than captured in an outer binding.
jest.mock("expo-audio", () => {
  // Untyped on purpose: babel's jest-hoist plugin rejects any identifier in a
  // mock factory that isn't defined inside it — including one in a type.
  const listeners = new Map();
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn((event, cb) => {
      listeners.set(event, cb);
      return { remove: jest.fn() };
    }),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    updateLockScreenMetadata: jest.fn(),
    setMediaButtons: jest.fn(),
    setLockScreenControls: jest.fn(),
    clearLockScreenControls: jest.fn(),
    currentTime: 0,
    duration: 0,
    playing: false,
    volume: 1,
  };
  // biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
  (globalThis as any).__audioPlayer = player;
  // biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
  (globalThis as any).__audioListeners = listeners;
  return { createAudioPlayer: () => player, setAudioModeAsync: jest.fn() };
});

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `https://server/stream/${id}`,
  trackTranscodeInfo: () => ({ active: false, fromLabel: null, toLabel: null }),
}));
jest.mock("@/services/backend/mediaAnnotation", () => ({
  scrobble: jest.fn(async () => undefined),
  reportPlayback: jest.fn(async () => undefined),
}));
jest.mock("@/services/endlessRadio", () => ({
  fetchEndlessExtension: jest.fn(async () => []),
}));
jest.mock("@/services/network", () => ({
  getIsOnline: () => mockIsOnline(),
  getServerReachable: () => mockIsOnline(),
  getIsEffectivelyOnline: () => mockIsOnline(),
  subscribeEffectiveOnline: jest.fn(() => jest.fn()),
  probeServer: jest.fn(),
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

test("player.ts loads when targets.ts is the first import", () => {
  expect(() => require("@/services/playback/targets")).not.toThrow();
  expect(require("@/services/player").playTracks).toEqual(expect.any(Function));
});
