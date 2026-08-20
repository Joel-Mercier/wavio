// `playTracks` must never replace the queue with a list that can't play right
// now: offline that used to strand the player (loadAndPlay finds no playable
// index, pauses and clears the lock screen), silently stopping whatever was
// already playing. See GitHub issue #134.
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
  queryClient: { getQueryData: jest.fn(), setQueryData: jest.fn() },
}));

// Inlined rather than referencing an outer const: services/player.ts creates its
// player at module scope, which runs before this file's own consts initialize.
jest.mock("expo-audio", () => ({
  createAudioPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    updateLockScreenMetadata: jest.fn(),
    setLockScreenControls: jest.fn(),
    clearLockScreenControls: jest.fn(),
    currentTime: 0,
    duration: 0,
    playing: false,
    volume: 1,
  }),
  setAudioModeAsync: jest.fn(),
}));

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
// Two axes: mockIsOnline is *effective* connectivity (device AND server), which
// is what onlineManager tracks; mockDeviceOnline is the device alone. They differ
// when the server is unreachable but the internet is up.
const mockDeviceOnline = jest.fn(() => true);
jest.mock("@/services/network", () => ({
  getIsOnline: () => mockDeviceOnline(),
  getServerReachable: () => mockIsOnline(),
  probeServer: jest.fn(),
}));

// The backend-dispatch graph pulls in config/i18n, whose zod locale imports are
// ESM that jest can't transform. Stub the locale module itself rather than every
// service that transitively reaches it.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import { playTracks } from "@/services/player";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";

const track = (id: string, extra: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    ...extra,
  }) as QueueTrack;

const resetQueue = (
  tracks: QueueTrack[] = [],
  currentIndex: number | null = null,
) =>
  useQueue.setState({
    queue: tracks,
    currentIndex,
    removePlayed: true,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });

const setDownloaded = (ids: string[]) =>
  useOffline.setState({
    downloadedTracks: Object.fromEntries(
      ids.map((id) => [id, { id, localUri: `file://${id}`, size: 1 }]),
    ),
  } as never);

beforeEach(() => {
  mockIsOnline.mockReturnValue(true);
  mockDeviceOnline.mockReturnValue(true);
  resetQueue();
  setDownloaded([]);
});

// Device up, server down — the state a LAN IP change leaves the app in.
const goServerUnreachable = () => {
  mockIsOnline.mockReturnValue(false);
  mockDeviceOnline.mockReturnValue(true);
};

const goOffline = () => {
  mockIsOnline.mockReturnValue(false);
  mockDeviceOnline.mockReturnValue(false);
};

const ids = () => useQueue.getState().queue.map((t) => t.id);

describe("playTracks playability guard", () => {
  test("online it replaces the queue regardless of download state", () => {
    expect(playTracks([track("a"), track("b")], 0)).toBe(true);
    expect(ids()).toEqual(["a", "b"]);
  });

  test("offline with nothing downloaded it leaves the queue untouched", () => {
    resetQueue([track("playing")], 0);
    setDownloaded(["playing"]);
    goOffline();

    expect(playTracks([track("a"), track("b")], 0)).toBe(false);
    // The previous queue — and so the track currently playing — survives.
    expect(ids()).toEqual(["playing"]);
    expect(useQueue.getState().currentIndex).toBe(0);
  });

  test("offline it still plays a partially downloaded list", () => {
    setDownloaded(["b"]);
    goOffline();

    expect(playTracks([track("a"), track("b")], 0)).toBe(true);
    expect(ids()).toEqual(["a", "b"]);
  });

  test("an empty list is a no-op", () => {
    expect(playTracks([], 0)).toBe(false);
    expect(ids()).toEqual([]);
  });
});

// loadAndPlay only ever walks forward, so the guard passing somewhere in the
// list isn't enough — the start index itself has to land on a playable track.
describe("playTracks start index resolution", () => {
  test("offline it skips forward to the first playable track", () => {
    setDownloaded(["c"]);
    goOffline();

    expect(playTracks([track("a"), track("b"), track("c")], 0)).toBe(true);
    expect(useQueue.getState().currentIndex).toBe(2);
  });

  test("offline it falls back to a playable track before the start index", () => {
    resetQueue([track("playing")], 0);
    setDownloaded(["playing", "a"]);
    goOffline();

    // Tapping the 3rd row of a list whose only download is the 1st: playing
    // forward from there is impossible, so start at "a" rather than strand.
    expect(playTracks([track("a"), track("b"), track("c")], 2)).toBe(true);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(useQueue.getState().currentIndex).toBe(0);
  });

  test("online it honours the requested start index untouched", () => {
    expect(playTracks([track("a"), track("b"), track("c")], 2)).toBe(true);
    expect(useQueue.getState().currentIndex).toBe(2);
  });
});

// Radio streams and third-party podcast enclosures don't come from the music
// server, so they survive it being unreachable.
describe("playTracks with off-server sources", () => {
  const radio = track("station", {
    url: "https://radio.example/stream",
    isRadio: true,
  });
  const taddyEpisode = track("episode", {
    url: "https://cdn.podcast.example/ep1.mp3",
    source: "podcast",
  });
  // Server-hosted podcasts bake the server's own stream URL, so they don't.
  const serverEpisode = track("server-episode", { source: "podcast" });

  test("a radio station plays while the server is unreachable", () => {
    goServerUnreachable();
    expect(playTracks([radio], 0)).toBe(true);
    expect(ids()).toEqual(["station"]);
  });

  test("a third-party podcast episode plays while the server is unreachable", () => {
    goServerUnreachable();
    expect(playTracks([taddyEpisode], 0)).toBe(true);
    expect(ids()).toEqual(["episode"]);
  });

  test("a server-hosted podcast episode does not", () => {
    resetQueue([track("playing")], 0);
    setDownloaded(["playing"]);
    goServerUnreachable();

    expect(playTracks([serverEpisode], 0)).toBe(false);
    expect(ids()).toEqual(["playing"]);
  });

  test("neither plays with the device offline", () => {
    goOffline();
    expect(playTracks([radio], 0)).toBe(false);
    expect(playTracks([taddyEpisode], 0)).toBe(false);
    expect(ids()).toEqual([]);
  });
});
