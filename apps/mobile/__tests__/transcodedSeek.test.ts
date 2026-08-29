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
    `https://server/stream/${id}${
      opts?.timeOffset ? `?timeOffset=${opts.timeOffset}` : ""
    }`,
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
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import { playTracks, seekTo } from "@/services/player";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";

const { __player: player } = jest.requireMock("expo-audio") as {
  __player: {
    replace: jest.Mock;
    seekTo: jest.Mock;
  };
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
  mockTranscodeActive.value = true;
  player.replace.mockClear();
  player.seekTo.mockClear();
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

  test("keeps reloading after the network stops predicting a transcode", () => {
    playTracks([track("a")], 0);
    // Cellular → Wi-Fi mid-track: the settings no longer ask for a transcode,
    // but the stream in the engine is still the one cellular loaded.
    mockTranscodeActive.value = false;

    seekTo(60);

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(lastLoadedUrl()).toContain("timeOffset=60");
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
