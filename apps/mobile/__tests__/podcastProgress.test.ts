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
  markPodcastEpisodePlayed,
  markPodcastEpisodesPlayed,
  markPodcastEpisodesUnplayed,
  markPodcastEpisodeUnplayed,
  markPodcastTrackFinished,
  recordPodcastProgress,
  resetPodcastProgressRuntime,
} from "@/services/podcastProgress";
import { usePodcastPlayedBase } from "@/stores/podcastPlayed";
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
  usePodcastPlayedBase.setState({ played: {} }, false);
  mockSetItem.mockClear();
});

const isPlayed = (id: string, bucket = "taddy") =>
  usePodcastPlayedBase.getState().isPlayed(bucket, id);

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
    const podcastsWrites = mockSetItem.mock.calls.filter(
      ([key]) => key === "podcasts",
    );
    expect(podcastsWrites).toHaveLength(1);
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

describe("played state", () => {
  test("reaching the end guard marks the episode played", () => {
    recordPodcastProgress(track(), 900, { force: true });
    recordPodcastProgress(track(), 3580);
    expect(entryFor("ep-1")).toBeUndefined();
    expect(isPlayed("ep-1")).toBe(true);
  });

  test("ticks in the tail after finishing don't write again", () => {
    recordPodcastProgress(track(), 3580);
    mockSetItem.mockClear();
    recordPodcastProgress(track(), 3585);
    recordPodcastProgress(track(), 3590);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test("a finished server episode is marked under the active scope", () => {
    markPodcastTrackFinished(
      track({ id: "srv-1", podcastSource: "server", streamId: "srv-1" }),
    );
    expect(isPlayed("srv-1", "scope-a")).toBe(true);
    expect(isPlayed("srv-1")).toBe(false);
  });

  test("marking played drops the progress entry and the pending slot", () => {
    recordPodcastProgress(track(), 900, { force: true });
    markPodcastEpisodePlayed("ep-1", "taddy");
    expect(entryFor("ep-1")).toBeUndefined();
    expect(getPodcastResumePosition(track())).toBeNull();
    expect(isPlayed("ep-1")).toBe(true);
  });

  test("the episode still playing when marked isn't put back in progress", () => {
    recordPodcastProgress(track(), 900, { force: true });
    markPodcastEpisodePlayed("ep-1", "taddy");
    recordPodcastProgress(track(), 950, { force: true });
    flushPodcastProgress();
    expect(entryFor("ep-1")).toBeUndefined();
    expect(isPlayed("ep-1")).toBe(true);
  });

  test("replaying a played episode past the floor unmarks it", () => {
    markPodcastEpisodePlayed("ep-1", "taddy");
    recordPodcastProgress(track(), 0);
    recordPodcastProgress(track(), 12);
    expect(isPlayed("ep-1")).toBe(true);
    recordPodcastProgress(track(), 25);
    expect(isPlayed("ep-1")).toBe(false);
    expect(entryFor("ep-1")?.position).toBe(25);
  });

  test("unmarking lets the playing episode record again", () => {
    markPodcastEpisodePlayed("ep-1", "taddy");
    markPodcastEpisodeUnplayed("ep-1", "taddy");
    expect(isPlayed("ep-1")).toBe(false);
    recordPodcastProgress(track(), 900, { force: true });
    expect(entryFor("ep-1")?.position).toBe(900);
  });
});

describe("markPodcastEpisodesPlayed", () => {
  test("marks the whole list and drops their resume entries", () => {
    recordPodcastProgress(track({ id: "ep-2" }), 600, { force: true });
    recordPodcastProgress(track({ id: "other" }), 600, { force: true });
    markPodcastEpisodesPlayed(["ep-1", "ep-2", "ep-3"], "taddy");
    expect(["ep-1", "ep-2", "ep-3"].every((id) => isPlayed(id))).toBe(true);
    expect(entryFor("ep-2")).toBeUndefined();
    expect(entryFor("other")?.position).toBe(600);
    expect(isPlayed("other")).toBe(false);
  });

  test("the playing episode stays played while it keeps playing", () => {
    recordPodcastProgress(track(), 900, { force: true });
    markPodcastEpisodesPlayed(["ep-1", "ep-2"], "taddy");
    recordPodcastProgress(track(), 960, { force: true });
    flushPodcastProgress();
    expect(entryFor("ep-1")).toBeUndefined();
    expect(isPlayed("ep-1")).toBe(true);
  });

  test("server episodes are marked under the active scope", () => {
    markPodcastEpisodesPlayed(["srv-1"], "server");
    expect(isPlayed("srv-1", "scope-a")).toBe(true);
  });
});

describe("markPodcastEpisodesUnplayed", () => {
  test("lets the playing episode record progress again", () => {
    recordPodcastProgress(track(), 900, { force: true });
    markPodcastEpisodesPlayed(["ep-1", "ep-2"], "taddy");
    markPodcastEpisodesUnplayed(["ep-1", "ep-2"], "taddy");
    expect(isPlayed("ep-1")).toBe(false);
    expect(isPlayed("ep-2")).toBe(false);
    recordPodcastProgress(track(), 960, { force: true });
    expect(entryFor("ep-1")?.position).toBe(960);
  });
});
