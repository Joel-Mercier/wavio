// The optional buttons of the Android media notification follow the
// mediaControlsLayout setting and the current track, and the favorite button
// stars the track from outside React. See GitHub issue #214.
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
import { useAppBase } from "@/stores/app";
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

beforeEach(() => {
  mockSetStarred.mockReset();
  useAppBase.setState({ mediaControlsLayout: "seek" });
  playing(track("a"));
});

describe("media notification buttons", () => {
  test("the default layout keeps both 10-second skips", () => {
    expect(lastPush()).toEqual([["seekBackward", "seekForward"], false]);
  });

  test("a favorite layout shows the current track's favorite state", () => {
    playing(track("b", { starred: "2026-01-01T00:00:00Z" }));
    useAppBase.setState({ mediaControlsLayout: "favoriteAndSeekForward" });

    expect(lastPush()).toEqual([["favorite", "seekForward"], true]);
  });

  test("the heart follows a star made elsewhere in the app", () => {
    useAppBase.setState({ mediaControlsLayout: "favorite" });
    expect(lastPush()).toEqual([["favorite"], false]);

    useQueue.getState().updateTrack("a", { starred: "2026-01-01T00:00:00Z" });

    expect(lastPush()).toEqual([["favorite"], true]);
  });

  test("radio and podcasts drop the favorite button", () => {
    useAppBase.setState({ mediaControlsLayout: "seekBackwardAndFavorite" });

    playing(track("radio", { isRadio: true }));
    expect(lastPush()).toEqual([["seekBackward"], false]);

    playing(track("episode", { source: "podcast" }));
    expect(lastPush()).toEqual([["seekBackward"], false]);
  });

  test("tapping the heart fills it at once and stars the track", async () => {
    useAppBase.setState({ mediaControlsLayout: "favorite" });
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

    expect(lastPush()).toEqual([["favorite"], true]);
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
    expect(lastPush()).toEqual([["favorite"], true]);
  });

  test("a failed star puts the heart back", async () => {
    useAppBase.setState({ mediaControlsLayout: "favorite" });
    mockSetStarred.mockRejectedValue(new Error("offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    listeners.remoteFavorite();
    expect(lastPush()).toEqual([["favorite"], true]);

    await flush();
    expect(lastPush()).toEqual([["favorite"], false]);
    warn.mockRestore();
  });
});
