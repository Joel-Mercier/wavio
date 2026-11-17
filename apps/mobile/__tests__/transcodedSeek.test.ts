// Seeking inside a server-transcoded stream reloads it at an offset, because the
// stream is served without a seekable length and a native seekTo just restarts
// it. Which of the two applies must follow the stream that is *loaded*, not what
// the current settings would produce: the streaming format and bitrate cap are
// per-network, so walking from cellular onto Wi-Fi mid-track used to flip the
// answer under a stream that was still a transcode, and the next scrub threw
// playback back to the beginning.
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

import { getStreamStartOffset, playTracks, seekTo } from "@/services/player";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";

const { __player: player } = jest.requireMock("expo-audio") as {
  __player: {
    play: jest.Mock;
    replace: jest.Mock;
    seekTo: jest.Mock;
    addListener: jest.Mock;
    setLockScreenStreamOffset: jest.Mock;
    currentTime: number;
    playing: boolean;
  };
};

const auth = (
  jest.requireMock("@/stores/auth") as {
    useAuthBase: { getState: () => { url: string } };
  }
).useAuthBase.getState();

const swapRoute = (url: string, fromFailed: boolean) => {
  auth.url = url;
  const { subscribeRouteSwap } = jest.requireMock("@/services/network") as {
    subscribeRouteSwap: jest.Mock;
  };
  subscribeRouteSwap.mock.calls[0][0]({ fromFailed });
};

const track = (id: string): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    suffix: "flac",
    bitRate: 1016,
  }) as QueueTrack;

const lastLoadedUrl = () =>
  player.replace.mock.calls.at(-1)?.[0]?.uri as string | undefined;

beforeEach(() => {
  auth.url = "https://server";
  player.currentTime = 0;
  player.playing = false;
  mockTranscodeActive.value = true;
  player.replace.mockClear();
  player.seekTo.mockClear();
  player.setLockScreenStreamOffset.mockClear();
  useOffline.setState({ downloadedTracks: {} } as never);
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: true,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
});

describe("seeking a transcoded stream", () => {
  test("reloads at an offset instead of seeking the loaded stream", () => {
    playTracks([track("a")], 0);

    seekTo(60);

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(lastLoadedUrl()).toContain("timeOffset=60");
  });

  test("reloads a stream that is no longer transcoded without an offset", () => {
    playTracks([track("a")], 0);
    // Cellular → Wi-Fi mid-track: the stream in the engine is still the one
    // cellular loaded, so it can't be seeked natively, but the replacement is a
    // direct-play stream that would ignore an offset and start at 0.
    mockTranscodeActive.value = false;

    seekTo(60);

    expect(lastLoadedUrl()).toBe("https://server/stream/a");
    expect(player.seekTo).toHaveBeenCalledWith(60);
  });

  test("seeks natively once a track loads without a transcode", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);

    seekTo(60);

    expect(player.seekTo).toHaveBeenCalledWith(60);
  });

  test("a track loaded on Wi-Fi still seeks natively after moving to cellular", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);
    mockTranscodeActive.value = true;

    seekTo(60);

    expect(player.seekTo).toHaveBeenCalledWith(60);
  });
});

// The OS media controls read the engine's clock, which restarts near 0 on a
// stream reloaded at an offset: they have to be told where it starts, before the
// new source loads, or the notification seek bar freezes or jumps back.
describe("the OS media controls on a transcoded stream", () => {
  const lastOffset = () =>
    player.setLockScreenStreamOffset.mock.calls.at(-1)?.[0] as number | null;

  test("learn the offset before the reloaded stream replaces the old one", () => {
    playTracks([track("a")], 0);
    expect(lastOffset()).toBe(0);

    seekTo(60);

    expect(lastOffset()).toBe(60_000);
    expect(
      player.setLockScreenStreamOffset.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(player.replace.mock.invocationCallOrder.at(-1) as number);
  });

  test("get no offset for a source that seeks natively", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);

    expect(lastOffset()).toBeNull();
  });

  test("hand their seeks back as a reload at the new offset", () => {
    playTracks([track("a")], 0);
    const remoteSeek = player.addListener.mock.calls.find(
      ([event]) => event === "remoteSeek",
    )?.[1] as (positionMs: number) => void;

    remoteSeek(90_000);

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(lastLoadedUrl()).toContain("timeOffset=90");
    expect(lastOffset()).toBe(90_000);
  });
});

// Issue #273: a swap to the fallback route mid-track reloaded the current track
// through the transcode-only offset path. A direct-play stream ignores the
// offset and restarts at 0 while the clock carried on from the old position.
describe("a route swap mid-track", () => {
  test("reloads a direct-play stream on the new route and seeks it", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);
    player.currentTime = 70;

    swapRoute("https://fallback", true);

    expect(lastLoadedUrl()).toBe("https://fallback/stream/a");
    expect(player.seekTo).toHaveBeenLastCalledWith(70);
    expect(getStreamStartOffset()).toBe(0);
  });

  test("reloads a transcoded stream on the new route at an offset", () => {
    playTracks([track("a")], 0);
    player.currentTime = 70;

    swapRoute("https://fallback", true);

    expect(lastLoadedUrl()).toBe("https://fallback/stream/a?timeOffset=70");
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(getStreamStartOffset()).toBe(70);
  });

  test("leaves the loaded source alone when its route didn't fail", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);
    const loads = player.replace.mock.calls.length;

    swapRoute("https://fallback", false);

    expect(player.replace.mock.calls.length).toBe(loads);
  });

  const statusListener = () =>
    player.addListener.mock.calls.find(
      ([event]) => event === "playbackStatusUpdate",
    )?.[1] as (status: object) => void;

  test("recovers a source whose route went away after a swap", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);
    swapRoute("https://fallback", false);
    player.currentTime = 95;
    player.play.mockClear();
    const onStatus = statusListener();

    onStatus({ playbackState: "buffering", playing: true, currentTime: 95 });
    onStatus({ playbackState: "idle", playing: false, currentTime: 95 });
    onStatus({ error: "Source error", playing: false, currentTime: 95 });

    expect(lastLoadedUrl()).toBe("https://fallback/stream/a");
    expect(player.seekTo).toHaveBeenLastCalledWith(95);
    expect(player.play).toHaveBeenCalled();
  });

  // The queue ending parks the player on its last track, paused at 0, which
  // re-reads the source: on a dead route that fails, and the recovery must not
  // start the finished queue over.
  test("recovers a paused source without starting playback", () => {
    mockTranscodeActive.value = false;
    playTracks([track("a")], 0);
    swapRoute("https://fallback", false);
    player.play.mockClear();
    const onStatus = statusListener();

    onStatus({ playbackState: "ready", playing: false, currentTime: 0 });
    onStatus({ error: "Source error", playing: false, currentTime: 0 });

    expect(lastLoadedUrl()).toBe("https://fallback/stream/a");
    expect(player.play).not.toHaveBeenCalled();
  });
});
