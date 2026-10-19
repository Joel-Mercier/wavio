// The optional buttons of the Android media notification follow the
// mediaControlsLeft / mediaControlsRight settings and the current track, and
// their taps act on the track and the queue from outside React. See GitHub
// issues #214 and #216.
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

// Inlined rather than referencing an outer const: services/player.ts creates its
// player at module scope, which runs before this file's own consts initialize.
jest.mock("expo-audio", () => {
  const listeners: Record<string, () => void> = {};
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    updateLockScreenMetadata: jest.fn(),
    setMediaButtons: jest.fn(),
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
    __listeners: listeners,
  };
});

jest.mock("@/hooks/backend/useMediaAnnotation", () => ({
  STARRED_AFFECTED_KEYS: [],
  setStarred: jest.fn(),
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

import { setStarred } from "@/hooks/backend/useMediaAnnotation";
import "@/services/player";
import { type MediaControlButton, useAppBase } from "@/stores/app";
import useQueue, { type QueueTrack } from "@/stores/queue";

const { __player: player, __listeners: listeners } = jest.requireMock(
  "expo-audio",
) as {
  __player: { setMediaButtons: jest.Mock };
  __listeners: Record<string, () => void>;
};
const mockSetStarred = setStarred as jest.Mock;

const track = (id: string, extra: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    ...extra,
  }) as QueueTrack;

const playing = (current: QueueTrack) =>
  useQueue.setState({ queue: [current], currentIndex: 0 });

const lastPush = () => player.setMediaButtons.mock.calls.at(-1);

const flush = () => new Promise((resolve) => setImmediate(resolve));

const layout = (
  mediaControlsLeft: MediaControlButton | null,
  mediaControlsRight: MediaControlButton | null,
) => useAppBase.setState({ mediaControlsLeft, mediaControlsRight });

beforeEach(() => {
  mockSetStarred.mockReset();
  useQueue.setState({ shuffle: false, repeatMode: "off" });
  layout("seekBackward", "seekForward");
  playing(track("a"));
});

describe("media notification buttons", () => {
  test("the default layout keeps both 10-second skips", () => {
    expect(lastPush()).toEqual(["seekBackward", "seekForward"]);
  });

  test("a favorite button shows the current track's favorite state", () => {
    playing(track("b", { starred: "2026-01-01T00:00:00Z" }));
    layout("favorite", "seekForward");

    expect(lastPush()).toEqual(["favoriteOn", "seekForward"]);
  });

  test("a button on the right alone stays on the right", () => {
    layout(null, "favorite");

    expect(lastPush()).toEqual([null, "favoriteOff"]);
  });

  test("the heart follows a star made elsewhere in the app", () => {
    layout("favorite", null);
    expect(lastPush()).toEqual(["favoriteOff", null]);

    useQueue.getState().updateTrack("a", { starred: "2026-01-01T00:00:00Z" });

    expect(lastPush()).toEqual(["favoriteOn", null]);
  });

  test("radio and podcasts drop favorite, shuffle and repeat", () => {
    layout("seekBackward", "favorite");
    playing(track("radio", { isRadio: true }));
    expect(lastPush()).toEqual(["seekBackward", null]);

    layout("shuffle", "repeat");
    expect(lastPush()).toEqual([null, null]);

    playing(track("episode", { source: "podcast" }));
    layout("shuffle", "seekForward");
    expect(lastPush()).toEqual([null, "seekForward"]);
  });

  test("the shuffle button follows and toggles the queue's shuffle", () => {
    layout("shuffle", "favorite");
    expect(lastPush()).toEqual(["shuffleOff", "favoriteOff"]);

    useQueue.getState().setShuffle(true);
    expect(lastPush()).toEqual(["shuffleOn", "favoriteOff"]);

    listeners.remoteShuffle();
    expect(useQueue.getState().shuffle).toBe(false);
    expect(lastPush()).toEqual(["shuffleOff", "favoriteOff"]);
  });

  test("the repeat button cycles off, all, one", () => {
    layout("seekBackward", "repeat");
    expect(lastPush()).toEqual(["seekBackward", "repeatOff"]);

    listeners.remoteRepeat();
    expect(useQueue.getState().repeatMode).toBe("all");
    expect(lastPush()).toEqual(["seekBackward", "repeatAll"]);

    listeners.remoteRepeat();
    expect(lastPush()).toEqual(["seekBackward", "repeatOne"]);

    listeners.remoteRepeat();
    expect(useQueue.getState().repeatMode).toBe("off");
    expect(lastPush()).toEqual(["seekBackward", "repeatOff"]);
  });

  test("tapping the heart fills it at once and stars the track", async () => {
    layout("favorite", null);
    let resolve: () => void = () => {};
    mockSetStarred.mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = () => {
            useQueue
              .getState()
              .updateTrack("a", { starred: "2026-01-01T00:00:00Z" });
            r();
          };
        }),
    );

    listeners.remoteFavorite();

    expect(lastPush()).toEqual(["favoriteOn", null]);
    expect(mockSetStarred).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "a" }),
      true,
    );

    // A second tap while the first is in flight must not race it.
    listeners.remoteFavorite();
    expect(mockSetStarred).toHaveBeenCalledTimes(1);

    resolve();
    await flush();
    expect(lastPush()).toEqual(["favoriteOn", null]);
  });

  test("a failed star puts the heart back", async () => {
    layout("favorite", null);
    mockSetStarred.mockRejectedValue(new Error("offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    listeners.remoteFavorite();
    expect(lastPush()).toEqual(["favoriteOn", null]);

    await flush();
    expect(lastPush()).toEqual(["favoriteOff", null]);
    warn.mockRestore();
  });
});

describe("media notification button settings", () => {
  test("picking the other side's button swaps the two sides", () => {
    layout("shuffle", "favorite");

    useAppBase.getState().setMediaControlButton("left", "favorite");

    expect(useAppBase.getState()).toMatchObject({
      mediaControlsLeft: "favorite",
      mediaControlsRight: "shuffle",
    });
  });

  test("clearing a side leaves the other alone", () => {
    layout("shuffle", "favorite");

    useAppBase.getState().setMediaControlButton("right", null);

    expect(useAppBase.getState()).toMatchObject({
      mediaControlsLeft: "shuffle",
      mediaControlsRight: null,
    });
  });

  test.each([
    ["seek", "seekBackward", "seekForward"],
    ["favoriteAndSeekForward", "favorite", "seekForward"],
    ["seekBackwardAndFavorite", "seekBackward", "favorite"],
    ["favorite", "favorite", null],
    ["none", null, null],
  ])("the v2 %s layout migrates to its two sides", (old, left, right) => {
    const migrate = useAppBase.persist.getOptions().migrate;
    const state = migrate?.({ mediaControlsLayout: old }, 2) as Record<
      string,
      unknown
    >;

    expect(state.mediaControlsLeft).toBe(left);
    expect(state.mediaControlsRight).toBe(right);
    expect(state).not.toHaveProperty("mediaControlsLayout");
  });
});
