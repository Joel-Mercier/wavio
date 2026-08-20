// The prefetch cache's eviction policy (issue #163). These assertions are what
// make "budget wins, window truncates" and "keep what gets played" true rather
// than aspirational — the disk cost of getting either wrong is the user's.

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
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
  currentAuthScope: () => "scope",
}));

const deleted: string[] = [];

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    get exists() {
      return true;
    }
    get name() {
      return this.uri.split("/").pop() ?? "";
    }
    create() {}
    list() {
      return [];
    }
    delete() {
      deleted.push(this.uri);
    }
  },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    get exists() {
      return true;
    }
    get size() {
      return 1;
    }
    delete() {
      deleted.push(this.uri);
    }
  },
}));

jest.mock("@/services/backend/streaming", () => ({
  cacheFetchUrl: () => null,
  cacheEstimatedBytes: () => 0,
}));

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => ({ isTrackDownloaded: () => false }) },
}));

import { evictionScore, pruneToBudget } from "@/services/trackCache";
import useTrackCache, { type TrackCacheEntry } from "@/stores/trackCache";

const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const entry = (
  id: string,
  overrides: Partial<TrackCacheEntry> = {},
): TrackCacheEntry => ({
  id,
  path: `file:///cache/${id}`,
  bytes: 5 * MB,
  suffix: "mp3",
  cachedAt: NOW,
  lastPlayedAt: 0,
  playCount: 0,
  ...overrides,
});

const seed = (entries: TrackCacheEntry[]) => {
  useTrackCache.getState().clearEntries();
  for (const e of entries) useTrackCache.getState().putEntry(e);
};

const ids = () =>
  useTrackCache
    .getState()
    .getEntriesList()
    .map((e) => e.id)
    .sort();

beforeEach(() => {
  deleted.length = 0;
  useTrackCache.getState().clearEntries();
});

describe("evictionScore", () => {
  test("a played track outranks an unplayed one of the same size and age", () => {
    const played = entry("played", { playCount: 4, lastPlayedAt: NOW });
    const unplayed = entry("unplayed");
    expect(evictionScore(played, NOW)).toBeGreaterThan(
      evictionScore(unplayed, NOW),
    );
  });

  test("recency decays by half over the half-life", () => {
    const fresh = entry("fresh", { playCount: 1, lastPlayedAt: NOW });
    const old = entry("old", {
      playCount: 1,
      cachedAt: NOW - 14 * DAY,
      lastPlayedAt: NOW - 14 * DAY,
    });
    expect(evictionScore(old, NOW)).toBeCloseTo(
      evictionScore(fresh, NOW) / 2,
      6,
    );
  });

  test("size weighting: a big track must earn its space", () => {
    // Same play history, ten times the bytes — worth a tenth as much per MB.
    const small = entry("small", { bytes: 4 * MB, playCount: 2 });
    const big = entry("big", { bytes: 40 * MB, playCount: 2 });
    expect(evictionScore(big, NOW)).toBeLessThan(evictionScore(small, NOW));
  });

  test("an unplayed entry still ranks by recency rather than flat zero", () => {
    const recent = entry("recent");
    const stale = entry("stale", { cachedAt: NOW - 30 * DAY });
    expect(evictionScore(recent, NOW)).toBeGreaterThan(
      evictionScore(stale, NOW),
    );
  });
});

describe("pruneToBudget", () => {
  test("does nothing while under budget", () => {
    seed([entry("a"), entry("b")]);
    pruneToBudget(100 * MB, new Set());
    expect(ids()).toEqual(["a", "b"]);
  });

  test("evicts the lowest-scoring entries first", () => {
    seed([
      entry("hot", { playCount: 10, lastPlayedAt: NOW }),
      entry("warm", { playCount: 2, lastPlayedAt: NOW }),
      entry("cold", { cachedAt: NOW - 60 * DAY }),
    ]);
    // 15 MB total, 10 MB budget: exactly one entry has to go.
    pruneToBudget(10 * MB, new Set());
    expect(ids()).toEqual(["hot", "warm"]);
  });

  test("never evicts a pinned entry, even when it scores worst", () => {
    seed([
      entry("pinned", { cachedAt: NOW - 90 * DAY }),
      entry("hot", { playCount: 10, lastPlayedAt: NOW }),
    ]);
    pruneToBudget(5 * MB, new Set(["pinned"]));
    expect(ids()).toEqual(["pinned"]);
  });

  test("stops when only pinned entries remain, even if still over budget", () => {
    seed([entry("p1"), entry("p2"), entry("loose")]);
    pruneToBudget(1 * MB, new Set(["p1", "p2"]));
    // The window is exempt, so the cache stays over budget rather than
    // evicting what playback is about to need — admission control is what
    // stops it growing from here.
    expect(ids()).toEqual(["p1", "p2"]);
    expect(useTrackCache.getState().totalBytes).toBe(10 * MB);
  });

  test("deletes the files of everything it evicts", () => {
    seed([entry("gone", { cachedAt: NOW - 90 * DAY }), entry("kept")]);
    pruneToBudget(5 * MB, new Set(["kept"]));
    expect(deleted.some((uri) => uri.includes("gone"))).toBe(true);
  });
});

describe("totalBytes accounting", () => {
  test("tracks additions, replacements and removals", () => {
    const state = () => useTrackCache.getState();
    state().putEntry(entry("a", { bytes: 3 * MB }));
    state().putEntry(entry("b", { bytes: 7 * MB }));
    expect(state().totalBytes).toBe(10 * MB);

    // Re-caching the same id must not double-count.
    state().putEntry(entry("a", { bytes: 5 * MB }));
    expect(state().totalBytes).toBe(12 * MB);

    state().removeEntries(["b"]);
    expect(state().totalBytes).toBe(5 * MB);

    state().removeEntries(["missing"]);
    expect(state().totalBytes).toBe(5 * MB);
  });

  test("touchEntry records a play without changing the size", () => {
    useTrackCache.getState().putEntry(entry("a", { bytes: 4 * MB }));
    useTrackCache.getState().touchEntry("a");
    useTrackCache.getState().touchEntry("a");
    const updated = useTrackCache.getState().getEntry("a");
    expect(updated?.playCount).toBe(2);
    expect(updated?.lastPlayedAt).toBeGreaterThan(0);
    expect(useTrackCache.getState().totalBytes).toBe(4 * MB);
  });
});
