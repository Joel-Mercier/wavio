// End-to-end through services/player.ts for the position saved on the device
// (issue #283): a restored track reports the position it is about to resume
// from before the engine has loaded it, and starting a track over drops the
// position an earlier listen saved for it.
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  const noBackup = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    getNoBackupStorage: () => ({
      set: (k: string, v: string) => noBackup.set(k, v),
      getString: (k: string) => noBackup.get(k),
      remove: (k: string) => noBackup.delete(k),
    }),
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

jest.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
}));

jest.mock("@/config/queryClient", () => ({
  queryClient: {
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    setQueriesData: jest.fn(),
    invalidateQueries: jest.fn(),
  },
}));

jest.mock("expo-audio", () => {
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
    setLockScreenStreamOffset: jest.fn(),
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
}));
jest.mock("@/services/endlessRadio", () => ({
  fetchEndlessExtension: jest.fn(async () => []),
}));
jest.mock("@/services/network", () => ({
  getIsOnline: () => true,
  getServerReachable: () => true,
  getIsEffectivelyOnline: () => true,
  probeServer: jest.fn(),
  subscribeRouteSwap: jest.fn(() => jest.fn()),
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import {
  getCurrentTime,
  playTracks,
  restoreServerPosition,
  restoreServerQueue,
} from "@/services/player";
import {
  armResume,
  getResumePosition,
  recordResumePosition,
} from "@/services/resumePositions";
import useQueue, { type QueueTrack } from "@/stores/queue";

// biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
const player = (globalThis as any).__audioPlayer;
const emitStatus = (status: Record<string, unknown>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
  (globalThis as any).__audioListeners.get("playbackStatusUpdate")({
    playing: false,
    currentTime: 0,
    duration: 0,
    didJustFinish: false,
    ...status,
  });

const song = (id: string): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    duration: 240,
  }) as QueueTrack;

beforeEach(() => {
  jest.clearAllMocks();
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: true,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
  player.currentTime = 0;
  player.duration = 0;
  player.playing = false;
  armResume(null);
});

// First on purpose: it is the app's launch, and rehydrating the queue ends the
// player's pre-launch mode, so every later test runs in a hydrated app.
describe("restoring the queue at launch", () => {
  test("loads the restored track at its saved position, and keeps it saved", () => {
    recordResumePosition(song("a"), 95, { force: true });
    armResume(null);
    const { createDynamicScopedStorage } = jest.requireMock(
      "@/config/storage",
    ) as { createDynamicScopedStorage: () => Storage };
    const storage = createDynamicScopedStorage();
    storage.setItem("queueStore:queue", JSON.stringify([song("a"), song("b")]));
    storage.setItem(
      "queueStore:cursor",
      JSON.stringify({
        currentIndex: 0,
        repeatMode: "off",
        shuffle: false,
        source: null,
      }),
    );

    // The rehydrate's own state change loads the track before the hydration
    // listeners run; that silent load must already resume it, not erase it.
    useQueue.persist.rehydrate();

    expect(player.replace).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(95);
    expect(getCurrentTime()).toBe(95);
    expect(getResumePosition(song("a"))).toBe(95);
  });
});

describe("position of a restored track", () => {
  test("is the one it resumes from until the engine has loaded it", () => {
    restoreServerQueue([song("a"), song("b")], 0, 90);
    // Loaded without playing: the engine is still at 0, and a queue push or a
    // handover to a cast device must not read that as the position.
    expect(player.currentTime).toBe(0);
    expect(getCurrentTime()).toBe(90);

    player.currentTime = 90;
    emitStatus({ playing: false, currentTime: 90, duration: 240 });
    player.currentTime = 95;
    expect(getCurrentTime()).toBe(95);
  });
});

describe("restoring the server's queue (issue #290)", () => {
  const albumSource = { type: "album", id: "al1", name: "Album" } as const;

  test("keeps the queue the server holds, with its context and play-next lane", () => {
    const local = [
      song("a"),
      { ...song("b"), queuedManually: true as const },
      song("c"),
    ];
    useQueue.setState({ queue: local, currentIndex: 0, source: albumSource });
    // Setting up a new current track plays it; only the restore is under test.
    player.play.mockClear();
    restoreServerPosition(0, 30);
    const state = useQueue.getState();
    expect(state.source).toEqual(albumSource);
    expect(state.queue).toBe(local);
    expect(state.currentIndex).toBe(0);
    expect(getCurrentTime()).toBe(30);
    expect(player.play).not.toHaveBeenCalled();
  });

  test("moves to the server's track without playing it", () => {
    useQueue.setState({
      queue: [song("a"), song("b"), song("c")],
      currentIndex: 0,
      source: albumSource,
    });
    player.play.mockClear();
    restoreServerPosition(2, 45);
    const state = useQueue.getState();
    expect(state.currentIndex).toBe(2);
    expect(state.source).toEqual(albumSource);
    expect(getCurrentTime()).toBe(45);
    expect(player.play).not.toHaveBeenCalled();
  });

  test("drops the local context when it replaces the queue", () => {
    useQueue.setState({
      queue: [song("a"), song("b")],
      currentIndex: 0,
      source: albumSource,
    });
    restoreServerQueue([song("c"), song("d")], 0, 0);
    expect(useQueue.getState().source).toBeNull();
  });
});

describe("starting a track over", () => {
  test("drops the position an earlier listen saved for it", () => {
    recordResumePosition(song("a"), 120, { force: true });
    // Picked again from a list: it starts at 0, and leaving it within the first
    // seconds (too early to save) must not bring 2:00 back on the next launch.
    playTracks([song("a")], 0);
    emitStatus({ playing: true, currentTime: 2, duration: 240 });

    armResume("a");
    expect(getResumePosition(song("a"))).toBeNull();
  });

  test("keeps the saved position when the launch track resumes from it", () => {
    recordResumePosition(song("a"), 120, { force: true });
    armResume("a");
    playTracks([song("a")], 0);
    expect(player.seekTo).toHaveBeenCalledWith(120);
  });
});
