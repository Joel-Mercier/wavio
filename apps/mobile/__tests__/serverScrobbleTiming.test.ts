// Issue #222: the server forwards a counted play (scrobble submission=true) to
// its linked Last.fm/ListenBrainz accounts at once, so the player must only send
// it at the half-track / four-minute mark — never a few seconds in — while still
// announcing now-playing at track start.
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

import { reportPlayback, scrobble } from "@/services/backend/mediaAnnotation";
import { playTracks } from "@/services/player";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

const emitStatus = (status: Record<string, unknown>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
  (globalThis as any).__audioListeners.get("playbackStatusUpdate")({
    playing: true,
    currentTime: 0,
    duration: 0,
    didJustFinish: false,
    ...status,
  });

// The player remembers the last announced track id across tests, so each test
// gets fresh ids or its track start would be taken for a repeat.
let run = 0;
const song = (name: string, duration: number): QueueTrack =>
  ({
    id: `${name}-${run}`,
    url: `https://server/stream/${name}-${run}`,
    title: name,
    artist: "Artist",
    duration,
  }) as QueueTrack;

const submissions = () =>
  jest
    .mocked(scrobble)
    .mock.calls.filter(([, options]) => options.submission === true);

const stoppedReports = (mediaId: string) =>
  jest
    .mocked(reportPlayback)
    .mock.calls.map(([params]) => params)
    .filter(
      (params) => params.state === "stopped" && params.mediaId === mediaId,
    );

const resetQueue = () =>
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: true,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });

beforeEach(() => {
  run += 1;
  jest.clearAllMocks();
  mockIsOnline.mockReturnValue(true);
  useServerExtensionsBase.getState().reset();
  resetQueue();
});

describe("classic scrobble", () => {
  test("announces now-playing at track start without counting the play", () => {
    playTracks([song("a", 213)]);
    emitStatus({ currentTime: 0, duration: 213 });
    expect(scrobble).toHaveBeenCalledWith(`a-${run}`, { submission: false });
    expect(submissions()).toHaveLength(0);
  });

  test("counts the play once, just past half the track", () => {
    playTracks([song("a", 213)]);
    for (const currentTime of [5, 30, 106.5, 107]) {
      emitStatus({ currentTime, duration: 213 });
    }
    expect(submissions()).toHaveLength(0);

    emitStatus({ currentTime: 107.5, duration: 213 });
    emitStatus({ currentTime: 150, duration: 213 });
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]).toEqual([
      `a-${run}`,
      expect.objectContaining({ submission: true, positionSeconds: 107.5 }),
    ]);
  });

  test("caps the wait at four minutes for long tracks", () => {
    playTracks([song("a", 1200)]);
    emitStatus({ currentTime: 240, duration: 1200 });
    expect(submissions()).toHaveLength(0);
    emitStatus({ currentTime: 241, duration: 1200 });
    expect(submissions()).toHaveLength(1);
  });

  test("waits for the server's length when the engine reports a shorter one", () => {
    playTracks([song("a", 215)]);
    emitStatus({ currentTime: 107.5, duration: 213 });
    expect(submissions()).toHaveLength(0);
    emitStatus({ currentTime: 108.5, duration: 213 });
    expect(submissions()).toHaveLength(1);
  });

  test("never counts a track shorter than thirty seconds", () => {
    playTracks([song("a", 20)]);
    emitStatus({ currentTime: 19, duration: 20 });
    expect(submissions()).toHaveLength(0);
  });
});

describe("playbackReport", () => {
  beforeEach(() => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "playbackReport", versions: [1] }]);
  });

  test("starts the session without a classic scrobble", () => {
    playTracks([song("a", 213)]);
    emitStatus({ currentTime: 0, duration: 213 });
    expect(reportPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: `a-${run}`, state: "starting" }),
    );
    expect(scrobble).not.toHaveBeenCalled();
  });

  test("a skip before the threshold leaves counting to the server", () => {
    playTracks([song("a", 213), song("b", 213)], 0);
    emitStatus({ currentTime: 30, duration: 213 });
    useQueue.getState().setCurrentIndex(1);
    expect(submissions()).toHaveLength(0);
    expect(stoppedReports(`a-${run}`)).toEqual([
      expect.objectContaining({ mediaId: `a-${run}`, ignoreScrobble: false }),
    ]);
  });

  test("a play counted at the threshold is ignored on stopped", () => {
    playTracks([song("a", 213), song("b", 213)], 0);
    emitStatus({ currentTime: 107.5, duration: 213 });
    expect(submissions()).toHaveLength(1);
    useQueue.getState().setCurrentIndex(1);
    expect(stoppedReports(`a-${run}`)).toEqual([
      expect.objectContaining({ mediaId: `a-${run}`, ignoreScrobble: true }),
    ]);
  });
});
