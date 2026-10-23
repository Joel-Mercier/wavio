// Issue #237: a UPnP renderer or Cast receiver fetches the stream itself, which
// no server counts as a play, while the local engine sits parked. The player
// must announce and count those plays from the remote target's own state.
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
import { advanceAfterTrackEnd } from "@/services/playback/remoteAdvance";
import {
  type RemoteTarget,
  registerRemoteTarget,
} from "@/services/playback/remoteTarget";
import { playTracks, takeOverFromRemote } from "@/services/player";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

const fake = {
  active: false,
  playsOnServer: false,
  playing: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
  listeners: new Set<() => void>(),
};

registerRemoteTarget({
  id: "fake",
  isActive: () => fake.active,
  get playsOnServer() {
    return fake.playsOnServer;
  },
  play: jest.fn(),
  pause: jest.fn(),
  togglePlayPause: jest.fn(),
  seekTo: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  getCurrentTime: () => fake.currentTime,
  isPlaying: () => fake.playing,
  release: jest.fn(async () => {}),
  isInterpolating: () => false,
  readSnapshot: () => ({
    playing: fake.playing,
    buffering: fake.buffering,
    currentTime: fake.currentTime,
    duration: fake.duration,
  }),
  subscribe: (onChange) => {
    fake.listeners.add(onChange);
    return () => fake.listeners.delete(onChange);
  },
} as RemoteTarget);

const remoteUpdate = (state: Partial<typeof fake>) => {
  Object.assign(fake, state);
  for (const listener of fake.listeners) listener();
};

const emitLocalStatus = (status: Record<string, unknown>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
  (globalThis as any).__audioListeners.get("playbackStatusUpdate")({
    playing: true,
    currentTime: 0,
    duration: 0,
    didJustFinish: false,
    ...status,
  });

let run = 0;
const song = (name: string, duration: number): QueueTrack =>
  ({
    id: `${name}-${run}`,
    url: `https://server/stream/${name}-${run}`,
    title: name,
    artist: "Artist",
    duration,
  }) as QueueTrack;

const nowPlaying = () =>
  jest
    .mocked(scrobble)
    .mock.calls.filter(([, options]) => options.submission === false);
const submissions = () =>
  jest
    .mocked(scrobble)
    .mock.calls.filter(([, options]) => options.submission === true);
const reports = (state: string) =>
  jest
    .mocked(reportPlayback)
    .mock.calls.map(([params]) => params)
    .filter((params) => params.state === state);

beforeEach(() => {
  run += 1;
  jest.clearAllMocks();
  mockIsOnline.mockReturnValue(true);
  useServerExtensionsBase.getState().reset();
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: true,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
  Object.assign(fake, {
    active: true,
    playsOnServer: false,
    playing: false,
    buffering: false,
    currentTime: 0,
    duration: 0,
  });
});

afterEach(() => {
  fake.active = false;
});

describe("classic scrobble on a remote target", () => {
  test("announces now-playing once the remote plays", () => {
    playTracks([song("a", 213)]);
    remoteUpdate({ buffering: true });
    expect(nowPlaying()).toHaveLength(0);
    remoteUpdate({ buffering: false, playing: true, duration: 213 });
    remoteUpdate({ currentTime: 1 });
    expect(nowPlaying()).toEqual([[`a-${run}`, { submission: false }]]);
    expect(submissions()).toHaveLength(0);
  });

  test("counts the play once, past half the track", () => {
    playTracks([song("a", 213)]);
    remoteUpdate({ playing: true, duration: 213, currentTime: 100 });
    expect(submissions()).toHaveLength(0);
    remoteUpdate({ currentTime: 108 });
    remoteUpdate({ currentTime: 150 });
    expect(submissions()).toEqual([
      [
        `a-${run}`,
        expect.objectContaining({ submission: true, positionSeconds: 108 }),
      ],
    ]);
  });

  test("ignores the parked local engine", () => {
    playTracks([song("a", 213)]);
    emitLocalStatus({ playing: false, currentTime: 150, duration: 213 });
    expect(scrobble).not.toHaveBeenCalled();
  });

  test("leaves the jukebox to the server", () => {
    fake.playsOnServer = true;
    playTracks([song("a", 213)]);
    remoteUpdate({ playing: true, duration: 213, currentTime: 150 });
    expect(scrobble).not.toHaveBeenCalled();
  });

  test("a track that ends counts even with no known length", () => {
    playTracks([song("a", 0), song("b", 0)], 0);
    remoteUpdate({ playing: true, currentTime: 90 });
    expect(submissions()).toHaveLength(0);
    remoteUpdate({ playing: false });
    advanceAfterTrackEnd({ reload: jest.fn(), stop: jest.fn() });
    expect(submissions()).toEqual([
      [`a-${run}`, expect.objectContaining({ submission: true })],
    ]);
    expect(useQueue.getState().getCurrent()?.id).toBe(`b-${run}`);
  });

  test("the last track isn't counted again once the queue runs out", () => {
    useQueue.setState({ removePlayed: false });
    playTracks([song("a", 213)]);
    remoteUpdate({ playing: true, duration: 213, currentTime: 108 });
    expect(submissions()).toHaveLength(1);
    remoteUpdate({ currentTime: 213 });
    const stop = jest.fn();
    advanceAfterTrackEnd({ reload: jest.fn(), stop });
    expect(stop).toHaveBeenCalled();
    remoteUpdate({ playing: false });
    remoteUpdate({ playing: false });
    expect(submissions()).toHaveLength(1);
  });

  test("repeat-one counts every loop", () => {
    useQueue.setState({ repeatMode: "one" });
    playTracks([song("a", 213)]);
    const reload = jest.fn();
    for (let loop = 0; loop < 2; loop++) {
      remoteUpdate({ playing: true, duration: 213, currentTime: 0 });
      remoteUpdate({ currentTime: 200 });
      remoteUpdate({ playing: false });
      advanceAfterTrackEnd({ reload, stop: jest.fn() });
    }
    expect(reload).toHaveBeenCalledTimes(2);
    expect(nowPlaying()).toHaveLength(2);
    expect(submissions()).toHaveLength(2);
  });

  test("handing back to the phone carries the same play on", () => {
    playTracks([song("a", 213)]);
    remoteUpdate({ playing: true, duration: 213, currentTime: 150 });
    expect(submissions()).toHaveLength(1);
    fake.active = false;
    takeOverFromRemote(150, true);
    emitLocalStatus({ playing: true, currentTime: 151, duration: 213 });
    expect(nowPlaying()).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
  });
});

describe("playbackReport on a remote target", () => {
  beforeEach(() => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "playbackReport", versions: [1] }]);
  });

  test("starts, pauses and stops the server session from the remote", () => {
    playTracks([song("a", 213), song("b", 213)], 0);
    remoteUpdate({ playing: true, duration: 213, currentTime: 0 });
    expect(reports("starting")).toEqual([
      expect.objectContaining({ mediaId: `a-${run}` }),
    ]);
    remoteUpdate({ playing: false, currentTime: 40 });
    expect(reports("paused")).toEqual([
      expect.objectContaining({ mediaId: `a-${run}`, positionMs: 40_000 }),
    ]);
    useQueue.getState().setCurrentIndex(1);
    expect(reports("stopped")).toEqual([
      expect.objectContaining({ mediaId: `a-${run}`, ignoreScrobble: false }),
    ]);
  });

  test("a play counted at the threshold is ignored on stopped", () => {
    playTracks([song("a", 213), song("b", 213)], 0);
    remoteUpdate({ playing: true, duration: 213, currentTime: 0 });
    remoteUpdate({ currentTime: 108 });
    expect(submissions()).toHaveLength(1);
    remoteUpdate({ currentTime: 210 });
    remoteUpdate({ playing: false });
    advanceAfterTrackEnd({ reload: jest.fn(), stop: jest.fn() });
    expect(reports("stopped")).toEqual([
      expect.objectContaining({ mediaId: `a-${run}`, ignoreScrobble: true }),
    ]);
  });
});
