// End-to-end through services/player.ts: playing a partly-heard podcast episode
// must resume where it stopped, finishing it must forget it, and a *skip* — the
// one way to leave an episode without ever reaching didJustFinish — must persist
// the position the engine still holds.
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
    // A non-podcast track *is* scrobblable, so its status tick reaches the
    // play-count bump the podcast path never runs.
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
const mockDeviceOnline = jest.fn(() => true);
jest.mock("@/services/network", () => ({
  getIsOnline: () => mockDeviceOnline(),
  getServerReachable: () => mockIsOnline(),
  probeServer: jest.fn(),
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import { playTracks } from "@/services/player";
import { resetPodcastProgressRuntime } from "@/services/podcastProgress";
import { usePodcastsBase } from "@/stores/podcasts";
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

const episode = (id: string, extra: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id,
    url: `https://cdn.example/${id}.mp3`,
    title: id,
    source: "podcast",
    podcastSource: "taddy",
    audioUrl: `https://cdn.example/${id}.mp3`,
    duration: 3600,
    ...extra,
  }) as QueueTrack;

const song = (id: string): QueueTrack =>
  ({ id, url: `https://server/stream/${id}`, title: id }) as QueueTrack;

const progressFor = (id: string) =>
  usePodcastsBase.getState().podcastProgress.find((e) => e.id === id);

const setProgress = (id: string, position: number, duration?: number) =>
  usePodcastsBase.getState().setPodcastProgress({
    id,
    source: "taddy",
    audioUrl: `https://cdn.example/${id}.mp3`,
    duration,
    position,
    updatedAt: Date.now(),
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetPodcastProgressRuntime();
  usePodcastsBase.setState({ podcastProgress: [] }, false);
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
});

describe("podcast resume on play", () => {
  test("playing an episode with a stored position seeks there", () => {
    setProgress("ep-1", 900, 3600);
    playTracks([episode("ep-1")]);
    expect(player.seekTo).toHaveBeenCalledWith(900);
  });

  test("an episode with no stored position starts at 0", () => {
    playTracks([episode("ep-1")]);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  test("a non-podcast track never touches the podcast store", () => {
    playTracks([song("s-1")]);
    emitStatus({ playing: true, currentTime: 300, duration: 3600 });
    expect(usePodcastsBase.getState().podcastProgress).toEqual([]);
  });
});

describe("podcast progress recording", () => {
  test("a playing status tick records the position", () => {
    playTracks([episode("ep-1")]);
    emitStatus({ playing: true, currentTime: 300, duration: 3600 });
    expect(progressFor("ep-1")?.position).toBe(300);
  });

  test("finishing an episode clears its entry", () => {
    setProgress("ep-1", 900, 3600);
    playTracks([episode("ep-1")]);
    emitStatus({ playing: false, currentTime: 3600, didJustFinish: true });
    expect(progressFor("ep-1")).toBeUndefined();
  });

  test("the finish → advance path does not resurrect a duration-less episode", () => {
    // With no duration the skip-flush can't fall back to the end guard, so only
    // the finishedPodcastId guard keeps the queue advance from re-recording it.
    const noDuration = { duration: undefined };
    playTracks([episode("ep-1", noDuration), episode("ep-2", noDuration)], 0);
    player.currentTime = 2400;
    emitStatus({ playing: false, currentTime: 2400, didJustFinish: true });
    expect(useQueue.getState().getCurrent()?.id).toBe("ep-2");
    expect(progressFor("ep-1")).toBeUndefined();
  });

  test("skipping to the next episode persists the outgoing position", () => {
    playTracks([episode("ep-1"), episode("ep-2")], 0);
    // The engine still holds the outgoing episode's position: player.replace
    // happens inside the same subscription callback, after the flush.
    player.currentTime = 1234;
    player.duration = 3600;
    useQueue.getState().setCurrentIndex(1);
    expect(progressFor("ep-1")?.position).toBe(1234);
    expect(useQueue.getState().getCurrent()?.id).toBe("ep-2");
  });

  test("skipping away from a nearly-finished episode clears it instead", () => {
    setProgress("ep-1", 900, 3600);
    playTracks([episode("ep-1"), episode("ep-2")], 0);
    player.currentTime = 3590;
    player.duration = 3600;
    useQueue.getState().setCurrentIndex(1);
    expect(progressFor("ep-1")).toBeUndefined();
  });
});
