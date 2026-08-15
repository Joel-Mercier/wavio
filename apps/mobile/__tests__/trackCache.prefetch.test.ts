// What the prefetch drain (issue #163) is allowed to evict to make room. The
// current track is deliberately absent from the window it fetches — but it is
// still the one file eviction must never take.

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
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
  currentAuthScope: () => "scope",
}));

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
    delete() {}
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
    delete() {}
  },
}));

jest.mock("@/services/backend/streaming", () => ({
  cacheFetchUrl: () => "https://server/rest/stream",
  // Admission control is not what's under test; let every candidate in.
  cacheEstimatedBytes: () => 0,
}));

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));

jest.mock("@/services/network", () => ({
  getConnectionType: () => "wifi",
  getIsEffectivelyOnline: () => true,
  subscribeConnectionType: () => () => {},
  subscribeEffectiveOnline: () => () => {},
}));

jest.mock("@/services/offline/downloadService", () => ({
  offlineDownloadService: { hasActiveWork: () => false },
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: {
    getState: () => ({ isTrackDownloaded: () => false, downloadQueue: [] }),
    subscribe: () => () => {},
  },
}));

const MB = 1024 * 1024;

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      trackCacheEnabled: true,
      trackCacheCount: 5,
      // Exactly the size of the playing track: caching anything at all puts the
      // cache over budget, which is what makes the drain prune.
      trackCacheBudgetMb: 40,
      trackCacheOnCellular: true,
    }),
    subscribe: () => () => {},
  },
}));

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => ({ getCurrent: () => ({ id: "playing" }) }),
    subscribe: () => () => {},
  },
  peekNextTracks: () => [{ id: "next", isRadio: false }],
}));

// The real thing writes to disk; everything else in the module stays real, so
// eviction and the index are the code under test.
jest.mock("@/services/trackCache", () => {
  const actual = jest.requireActual("@/services/trackCache");
  return {
    ...actual,
    cacheTrack: async (track: { id: string }) => {
      require("@/stores/trackCache")
        .default.getState()
        .putEntry({
          id: track.id,
          path: `file:///cache/${track.id}`,
          bytes: 4 * 1024 * 1024,
          suffix: "mp3",
          cachedAt: Date.now(),
          lastPlayedAt: 0,
          playCount: 0,
        });
      return true;
    },
  };
});

import {
  __resetDecodeFallbacks,
  noteStreamOverOffline,
} from "@/services/playback/decodeFallback";
import {
  __resetTrackCachePrefetch,
  resumeTrackCachePrefetch,
} from "@/services/trackCache/prefetcher";
import useTrackCache from "@/stores/trackCache";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  __resetTrackCachePrefetch();
  __resetDecodeFallbacks();
  useTrackCache.getState().clearEntries();
});

describe("prefetch drain", () => {
  test("never evicts the track that is playing to make room", async () => {
    // A big lossless track just started. Score divides by size, so it ranks
    // below every small speculative copy — without an explicit pin it is the
    // first thing freed, and the next seek reopens a path with nothing there.
    useTrackCache.getState().putEntry({
      id: "playing",
      path: "file:///cache/playing",
      bytes: 40 * MB,
      suffix: "flac",
      cachedAt: Date.now(),
      lastPlayedAt: Date.now(),
      playCount: 1,
    });

    resumeTrackCachePrefetch();
    await flush();

    expect(useTrackCache.getState().getEntry("playing")?.bytes).toBe(40 * MB);
    expect(useTrackCache.getState().getEntry("next")).not.toBeNull();
  });

  test("does not fetch a track this device can't decode off disk", async () => {
    // resolveTrackUrl streams these from the server whatever is on disk, so a
    // cached copy is budget and cellular data spent on bytes nothing will read.
    noteStreamOverOffline("next");

    resumeTrackCachePrefetch();
    await flush();

    expect(useTrackCache.getState().getEntry("next")).toBeNull();
  });
});
