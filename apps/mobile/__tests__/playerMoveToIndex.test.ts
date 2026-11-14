// Deleting or hiding the current track moves the queue on to the next one. A
// paused player must load it and stay paused, not start playing on its own.
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

// `url` moves on a route swap (primary <-> fallback), like the real store.
jest.mock("@/stores/auth", () => {
  const state = {
    url: "https://server",
    username: "n",
    serverType: "opensubsonic",
  };
  return {
    useAuthBase: {
      getState: () => state,
      subscribe: jest.fn(() => jest.fn()),
    },
    registerLogoutHandler: jest.fn(),
    currentAuthScope: () => "scope",
  };
});

jest.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
}));

jest.mock("@/config/queryClient", () => ({
  queryClient: { getQueryData: jest.fn(), setQueryData: jest.fn() },
}));

// The player object is built inside the factory and handed back out through the
// mock's own export: services/player.ts creates its player at module scope, which
// runs before any const in this file initializes.
jest.mock("expo-audio", () => {
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
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
  return {
    createAudioPlayer: () => player,
    setAudioModeAsync: jest.fn(),
    __player: player,
  };
});

// Stands in for the network-dependent prediction: true while the settings for
// the current network transcode this track.
const mockTranscodeActive = { value: true };
jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string, opts?: { timeOffset?: number }) =>
    `${
      jest.requireMock("@/stores/auth").useAuthBase.getState().url
    }/stream/${id}${opts?.timeOffset ? `?timeOffset=${opts.timeOffset}` : ""}`,
  trackTranscodeInfo: () => ({
    active: mockTranscodeActive.value,
    fromLabel: null,
    toLabel: null,
  }),
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
  subscribeRouteSwap: jest.fn(() => () => {}),
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import { moveToIndex, playTracks } from "@/services/player";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";

const { __player: player } = jest.requireMock("expo-audio") as {
  __player: {
    play: jest.Mock;
    replace: jest.Mock;
    playing: boolean;
  };
};

const track = (id: string): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    suffix: "mp3",
  }) as QueueTrack;

const lastLoadedUrl = () =>
  player.replace.mock.calls.at(-1)?.[0]?.uri as string | undefined;

beforeAll(async () => {
  await useQueue.persist.rehydrate();
  await new Promise((resolve) => setImmediate(resolve));
});

beforeEach(() => {
  mockTranscodeActive.value = false;
  useOffline.setState({ downloadedTracks: {} } as never);
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: false,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
  playTracks([track("a"), track("b"), track("c")], 0);
  player.play.mockClear();
  player.replace.mockClear();
});

describe("moveToIndex", () => {
  test("loads the new current track without starting a paused player", () => {
    player.playing = false;

    moveToIndex(1);

    expect(lastLoadedUrl()).toBe("https://server/stream/b");
    expect(player.play).not.toHaveBeenCalled();
  });

  test("keeps a playing player playing", () => {
    player.playing = true;

    moveToIndex(1);

    expect(lastLoadedUrl()).toBe("https://server/stream/b");
    expect(player.play).toHaveBeenCalled();
  });

  test("doesn't leave the next change silenced when the track stays the same", () => {
    player.playing = false;
    moveToIndex(0);
    player.playing = true;

    moveToIndex(2);

    expect(player.play).toHaveBeenCalled();
  });
});
