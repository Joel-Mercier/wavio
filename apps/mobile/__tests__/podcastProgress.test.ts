// Podcast resume positions are written to a persisted MMKV store from the
// player's ~4 Hz status listener, so the throttle is load-bearing: these tests
// count the actual storage writes rather than trusting the in-memory state.
const mockSetItem = jest.fn();
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
    // Only the podcasts store (global, zustandStorage) is counted; the scoped
    // stores pulled in transitively must not inflate the write count.
    zustandStorage: {
      setItem: (k: string, v: string) => {
        mockSetItem(k, v);
        mem.set(k, v);
      },
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope-a",
  };
});

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope-a",
  useAuthBase: {
    getState: () => ({ url: "https://server", serverId: "s1" }),
  },
}));

jest.mock("@/stores/servers", () => ({
  useServersBase: { getState: () => ({ getServerById: () => undefined }) },
}));

import { localPodcastEpisodeId } from "@/services/local/keys";
import {
  clearPodcastProgress,
  flushPodcastProgress,
  getPodcastResumePosition,
  isPodcastTrack,
  recordPodcastProgress,
  resetPodcastProgressRuntime,
} from "@/services/podcastProgress";
import { usePodcastsBase } from "@/stores/podcasts";
import type { QueueTrack } from "@/stores/queue";

const track = (extra: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id: "ep-1",
    url: "https://cdn.example/ep-1.mp3",
    title: "Episode 1",
    source: "podcast",
    podcastSource: "taddy",
    audioUrl: "https://cdn.example/ep-1.mp3",
    duration: 3600,
    ...extra,
  }) as QueueTrack;

const entries = () => usePodcastsBase.getState().podcastProgress;
const entryFor = (id: string) => entries().find((e) => e.id === id);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  mockSetItem.mockClear();
  resetPodcastProgressRuntime();
  usePodcastsBase.setState({ podcastProgress: [] }, false);
  mockSetItem.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("isPodcastTrack", () => {
  test("only podcast-sourced non-radio tracks qualify", () => {
    expect(isPodcastTrack(track())).toBe(true);
    expect(isPodcastTrack(track({ source: "album" }))).toBe(false);
    expect(isPodcastTrack(track({ isRadio: true }))).toBe(false);
    expect(isPodcastTrack(null)).toBe(false);
  });
});

describe("recordPodcastProgress throttling", () => {
  test("a burst of ticks inside the window produces a single write", () => {
    // 40 ticks ≈ 10s of the status listener's 4 Hz.
    for (let i = 0; i < 40; i++) {
      recordPodcastProgress(track(), 100 + i * 0.25);
      jest.advanceTimersByTime(250);
    }
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  test("the first record after the window elapses writes again", () => {
    recordPodcastProgress(track(), 100);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(11_000);
    recordPodcastProgress(track(), 111);
    expect(mockSetItem).toHaveBeenCalledTimes(2);
    expect(entryFor("ep-1")?.position).toBe(111);
  });

  test("force writes immediately, inside the window", () => {
    recordPodcastProgress(track(), 100);
    mockSetItem.mockClear();
    recordPodcastProgress(track(), 103, { force: true });
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(entryFor("ep-1")?.position).toBe(103);
  });

  test("a new episode writes immediately even inside the window", () => {
    recordPodcastProgress(track(), 100);
    mockSetItem.mockClear();
    recordPodcastProgress(track({ id: "ep-2" }), 60);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(entries().map((e) => e.id)).toEqual(["ep-2", "ep-1"]);
  });

  test("flush persists the position accumulated since the last write", () => {
    recordPodcastProgress(track(), 100);
    mockSetItem.mockClear();
    recordPodcastProgress(track(), 107);
    expect(entryFor("ep-1")?.position).toBe(100);
    flushPodcastProgress();
    expect(entryFor("ep-1")?.position).toBe(107);
  });
});

describe("recordPodcastProgress thresholds", () => {
  test("below the 20s floor nothing is recorded", () => {
    recordPodcastProgress(track(), 12);
    expect(entries()).toEqual([]);
  });

  test("below the floor an existing entry is NOT cleared", () => {
    // The first status ticks after a resume load report ~0 before the armed seek
    // lands; clearing there would erase the entry being resumed from.
    recordPodcastProgress(track(), 900, { force: true });
    recordPodcastProgress(track(), 0);
    recordPodcastProgress(track(), 3);
    expect(entryFor("ep-1")?.position).toBe(900);
  });

  test("within 30s of the end the entry is cleared, unthrottled", () => {
    recordPodcastProgress(track(), 900, { force: true });
    mockSetItem.mockClear();
    recordPodcastProgress(track(), 3580);
    expect(entryFor("ep-1")).toBeUndefined();
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  test("the status duration wins over a lying track duration", () => {
    // Feed claims 60s; the engine knows it's an hour, so 3000s is mid-episode.
    recordPodcastProgress(track({ duration: 60 }), 3000, { duration: 3600 });
    expect(entryFor("ep-1")?.position).toBe(3000);
    expect(entryFor("ep-1")?.duration).toBe(3600);
  });

  test("with no duration on either channel it records and never end-guards", () => {
    const noDuration = track({ duration: undefined });
    recordPodcastProgress(noDuration, 5000);
    const entry = entryFor("ep-1");
    expect(entry?.position).toBe(5000);
    expect(entry?.duration).toBeUndefined();
  });
});

describe("getPodcastResumePosition", () => {
  test("returns the stored position", () => {
    recordPodcastProgress(track(), 900, { force: true });
    expect(getPodcastResumePosition(track())).toBe(900);
  });

  test("prefers the pending position over the persisted one", () => {
    recordPodcastProgress(track(), 900, { force: true });
    // Inside the throttle window, so the store still says 900.
    recordPodcastProgress(track(), 950);
    expect(entryFor("ep-1")?.position).toBe(900);
    // playTracks can re-load the same episode without the queue subscription
    // firing, so a stale read here would rewind the listener by up to 10s.
    expect(getPodcastResumePosition(track())).toBe(950);
  });

  test("returns null for a non-podcast track and for an unknown episode", () => {
    recordPodcastProgress(track(), 900, { force: true });
    expect(getPodcastResumePosition(track({ source: "album" }))).toBeNull();
    expect(getPodcastResumePosition(track({ id: "other" }))).toBeNull();
    expect(getPodcastResumePosition(null)).toBeNull();
  });

  test("clearPodcastProgress drops the pending slot too", () => {
    recordPodcastProgress(track(), 900, { force: true });
    clearPodcastProgress("ep-1");
    expect(getPodcastResumePosition(track())).toBeNull();
    flushPodcastProgress();
    expect(entryFor("ep-1")).toBeUndefined();
  });
});

describe("source discrimination", () => {
  test("an explicit podcastSource is honoured, and scopes only server entries", () => {
    recordPodcastProgress(track({ podcastSource: "taddy" }), 900);
    expect(entryFor("ep-1")).toMatchObject({
      source: "taddy",
      audioUrl: "https://cdn.example/ep-1.mp3",
    });
    expect(entryFor("ep-1")?.scope).toBeUndefined();

    recordPodcastProgress(
      track({ id: "srv-1", podcastSource: "server", streamId: "stream-9" }),
      900,
    );
    expect(entryFor("srv-1")).toMatchObject({
      source: "server",
      streamId: "stream-9",
      scope: "scope-a",
    });
  });

  test("a local episode id infers 'server' despite a third-party url", () => {
    // The trap: streamUrl decodes a local-pod-ep- id back into its enclosure
    // URL, so the url alone looks exactly like a Taddy episode's.
    const id = localPodcastEpisodeId("https://feeds.example/ep.mp3");
    recordPodcastProgress(
      {
        id,
        url: "https://feeds.example/ep.mp3",
        source: "podcast",
        duration: 3600,
      } as QueueTrack,
      900,
    );
    expect(entryFor(id)).toMatchObject({
      source: "server",
      streamId: id,
      scope: "scope-a",
    });
  });

  test("a legacy track with an audioUrl and no discriminator infers 'taddy'", () => {
    recordPodcastProgress(
      {
        id: "legacy-1",
        url: "https://cdn.example/legacy.mp3",
        audioUrl: "https://cdn.example/legacy.mp3",
        source: "podcast",
        duration: 3600,
      } as QueueTrack,
      900,
    );
    expect(entryFor("legacy-1")?.source).toBe("taddy");
  });
});
