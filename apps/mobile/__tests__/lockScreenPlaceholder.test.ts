// Some lock screens keep drawing the previous track's cover when the new
// metadata carries no artwork (issue #287), so the OS controls must always get
// one: the track's cover when it can be shown, the placeholder otherwise.
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

jest.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
}));

jest.mock("@/config/queryClient", () => ({
  queryClient: {
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    setQueriesData: jest.fn(),
    invalidateQueries: jest.fn(),
  },
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
const mockOnline = jest.fn(() => true);
jest.mock("@/services/network", () => ({
  getIsOnline: () => true,
  getServerReachable: () => true,
  getIsEffectivelyOnline: () => mockOnline(),
  subscribeEffectiveOnline: jest.fn(() => jest.fn()),
  probeServer: jest.fn(),
  subscribeRouteSwap: jest.fn(() => jest.fn()),
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: "en" },
  applyZodLocale: jest.fn(),
}));

const PLACEHOLDER = "file:///cache/placeholder.png";
const mockArtwork = {
  placeholder: PLACEHOLDER as string | undefined,
  mirrored: new Map<string, string>(),
  download: jest.fn<Promise<string | undefined>, [string]>(),
};
jest.mock("@/services/lockScreenArtwork", () => ({
  cachedArtworkUri: (url: string | undefined) =>
    url ? mockArtwork.mirrored.get(url) : undefined,
  ensureArtworkCached: (url: string) => mockArtwork.download(url),
  clearArtworkCache: jest.fn(),
  lockScreenPlaceholderUri: () => mockArtwork.placeholder,
}));

const mockNeedsAuth = jest.fn(() => false);
jest.mock("@/services/serverHeaders", () => ({
  ...jest.requireActual("@/services/serverHeaders"),
  customHeadersForUrl: () => (mockNeedsAuth() ? { "X-Key": "k" } : undefined),
  authHeadersForUrl: () => undefined,
}));

import { playTracks } from "@/services/player";
import type { QueueTrack } from "@/stores/queue";

type Metadata = { title?: string; artworkUrl?: string };
// biome-ignore lint/suspicious/noExplicitAny: test-only handle on the engine
const engine = () => (globalThis as any).__audioPlayer;

// The artwork the controls showed over time, across both entry points. A push
// that repeats the current artwork changes nothing on screen, so it's folded.
const shownArtwork = (): (string | undefined)[] => {
  const calls: [number, Metadata][] = [
    ...engine().setActiveForLockScreen.mock.calls.map(
      (args: unknown[], i: number) => [
        engine().setActiveForLockScreen.mock.invocationCallOrder[i],
        args[1] as Metadata,
      ],
    ),
    ...engine().updateLockScreenMetadata.mock.calls.map(
      (args: unknown[], i: number) => [
        engine().updateLockScreenMetadata.mock.invocationCallOrder[i],
        args[0] as Metadata,
      ],
    ),
  ];
  return calls
    .sort((a, b) => a[0] - b[0])
    .map(([, m]) => m.artworkUrl)
    .filter((artwork, i, all) => i === 0 || artwork !== all[i - 1]);
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const track = (id: string, artwork?: string): QueueTrack =>
  ({
    id,
    url: `https://server/stream/${id}`,
    title: id,
    artwork,
  }) as QueueTrack;

const COVER = "https://server/rest/getCoverArt?id=al-1";

beforeEach(() => {
  mockArtwork.placeholder = PLACEHOLDER;
  mockArtwork.mirrored.clear();
  mockArtwork.download.mockReset();
  mockNeedsAuth.mockReturnValue(false);
  mockOnline.mockReturnValue(true);
  engine().setActiveForLockScreen.mockClear();
  engine().updateLockScreenMetadata.mockClear();
});

test("a track without a cover shows the placeholder", async () => {
  playTracks([track("a")], 0);
  await flush();

  expect(shownArtwork()).toEqual([PLACEHOLDER]);
});

test.each(["content://media/external/images/1", "cover.jpg"])(
  "an artwork the controls can't parse (%s) gets the placeholder",
  async (artwork) => {
    playTracks([track("a", artwork)], 0);
    await flush();

    expect(shownArtwork()).toEqual([PLACEHOLDER]);
  },
);

test("without a placeholder the update still goes out, artwork-less", async () => {
  mockArtwork.placeholder = undefined;

  playTracks([track("a")], 0);
  await flush();

  expect(shownArtwork()).toEqual([undefined]);
  expect(engine().updateLockScreenMetadata.mock.calls.at(-1)?.[0]).toEqual(
    expect.objectContaining({ title: "a" }),
  );
});

test("a remote cover while the server is unreachable shows the placeholder at once", async () => {
  mockOnline.mockReturnValue(false);
  mockArtwork.download.mockResolvedValue(undefined);

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual([PLACEHOLDER]);
  expect(engine().updateLockScreenMetadata).toHaveBeenCalledTimes(1);
});

test("a failed mirror doesn't re-send the placeholder the controls already show", async () => {
  mockNeedsAuth.mockReturnValue(true);
  mockArtwork.download.mockResolvedValue(undefined);

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual([PLACEHOLDER]);
  expect(engine().updateLockScreenMetadata).toHaveBeenCalledTimes(1);
});

test("a cover that fails to mirror is replaced by the placeholder", async () => {
  mockArtwork.download.mockResolvedValue(undefined);

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual([COVER, PLACEHOLDER]);
});

test("a mirrored cover replaces the remote URL", async () => {
  mockArtwork.download.mockResolvedValue("file:///cache/cover");

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual([COVER, "file:///cache/cover"]);
});

test("a cover behind auth headers holds the placeholder until it is mirrored", async () => {
  mockNeedsAuth.mockReturnValue(true);
  mockArtwork.download.mockResolvedValue("file:///cache/cover");

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual([PLACEHOLDER, "file:///cache/cover"]);
});

test("a local cover is shown as is and never mirrored", async () => {
  playTracks([track("a", "file:///library/cover.jpg")], 0);
  await flush();

  expect(shownArtwork()).toEqual(["file:///library/cover.jpg"]);
  expect(mockArtwork.download).not.toHaveBeenCalled();
});

test("an already mirrored cover is shown without another download", async () => {
  mockArtwork.mirrored.set(COVER, "file:///cache/cover");

  playTracks([track("a", COVER)], 0);
  await flush();

  expect(shownArtwork()).toEqual(["file:///cache/cover"]);
  expect(mockArtwork.download).not.toHaveBeenCalled();
});
