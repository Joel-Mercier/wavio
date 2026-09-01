// A track the engine refuses gets one automatic retry through a server-side
// transcode. The gate used to be `isDecodeError`, which matches only a message
// naming a codec — but media3 puts just the failure *category* in
// PlaybackException.message ("Source error", "Unexpected runtime error") and
// keeps the cause in a chain expo-audio never forwards. So the fallback almost
// never fired: every failure Sentry received carried `isDecodeError: false`,
// including ones whose bytes probed back as healthy audio.
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

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string, opts?: { forceTranscode?: boolean }) =>
    `https://server/stream/${id}${opts?.forceTranscode ? "?format=mp3" : ""}`,
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
}));
jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
  reportBreadcrumb: jest.fn(),
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

import { playTracks } from "@/services/player";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";

const { __player: player } = jest.requireMock("expo-audio") as {
  __player: { replace: jest.Mock; addListener: jest.Mock };
};

// handlePlaybackStatus is wired at module scope and not exported; drive it the
// way expo-audio does.
const emitStatus = (error: string | null) => {
  const listener = player.addListener.mock.calls.find(
    ([event]: [string]) => event === "playbackStatusUpdate",
  )?.[1] as (status: Record<string, unknown>) => void;
  listener({
    error,
    playbackState: "idle",
    duration: 0,
    currentTime: 0,
    playing: false,
  });
};

const track = (id: string): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    suffix: "flac",
  }) as QueueTrack;

const loadCount = () => player.replace.mock.calls.length;

beforeEach(() => {
  player.replace.mockClear();
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
  // A clean status clears the "already handled this error" key between cases.
  emitStatus(null);
});

describe("transcode retry on an engine playback failure", () => {
  // The two messages actually observed in Sentry on 1.2.0 / 1.3.0. Neither
  // contains "decode", which is why the fallback never fired for them.
  // A fresh id per case: the one-retry cap is per track and persists for the
  // life of the module, so reusing one would make the later cases pass or fail
  // for the wrong reason.
  it.each([
    ["Source error", "generic-source"],
    ["Unexpected runtime error", "generic-runtime"],
    ["Renderer error", "generic-renderer"],
  ])("reloads through a transcode for a bare %p", (message, id) => {
    playTracks([track(id)]);
    const before = loadCount();
    emitStatus(message);
    expect(loadCount()).toBe(before + 1);
  });

  it("still reloads for a message that does name the codec", () => {
    playTracks([track("t2")]);
    const before = loadCount();
    emitStatus("MediaCodecAudioRenderer error, index=0");
    expect(loadCount()).toBe(before + 1);
  });

  it("does not reload for a failure a transcode cannot fix", () => {
    playTracks([track("t3")]);
    const before = loadCount();
    emitStatus("Playback was interrupted");
    expect(loadCount()).toBe(before);
  });

  it("retries a given track only once", () => {
    playTracks([track("t4")]);
    emitStatus("Source error");
    const afterFirst = loadCount();
    // A different message, so the dedupe key doesn't swallow it — the cap is
    // hasTranscodeRetried, not the report dedupe.
    emitStatus("Unexpected runtime error");
    expect(loadCount()).toBe(afterFirst);
  });
});
