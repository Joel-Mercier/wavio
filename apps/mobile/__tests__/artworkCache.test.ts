// Cover art used to be cached only by the extended-offline library crawl, so a
// user who merely saved an album for offline listening got audio and nothing
// else — offline, the player and the media notification fell back to a generic
// icon. artworkCacheService owns that cache for every download path now, which
// puts three rules under test: what it refuses to fetch (ids that aren't
// fetchable, backends that serve covers from disk already), which cover a track
// resolves to (its album's when that album is saved, its own otherwise), and
// what survives a prune.

const mockAuthState = {
  url: "https://server" as string | null,
  username: "n" as string | null,
  serverId: "s1" as string | null,
  serverType: "navidrome",
};

const mockOfflineState = {
  artworkCache: {} as Record<string, string>,
  artworkCachedAt: {} as Record<string, string>,
  artworkAliases: {} as Record<string, string>,
  downloadedCollections: {} as Record<
    string,
    { id: string; coverArt?: string; artistId?: string }
  >,
  downloadedTracks: [] as { id: string; coverArt?: string }[],
  downloadQueue: [] as { id: string; coverArt?: string }[],
};

const offlineStore = {
  get artworkCache() {
    return mockOfflineState.artworkCache;
  },
  get artworkCachedAt() {
    return mockOfflineState.artworkCachedAt;
  },
  get artworkAliases() {
    return mockOfflineState.artworkAliases;
  },
  get downloadedCollections() {
    return mockOfflineState.downloadedCollections;
  },
  get downloadQueue() {
    return mockOfflineState.downloadQueue;
  },
  getDownloadedTracksList: () => mockOfflineState.downloadedTracks,
  addCachedArtwork: (key: string, uri: string) => {
    mockOfflineState.artworkCache[key] = uri;
    mockOfflineState.artworkCachedAt[key] = new Date().toISOString();
  },
  removeCachedArtwork: (keys: string[]) => {
    for (const key of keys) {
      delete mockOfflineState.artworkCache[key];
      delete mockOfflineState.artworkCachedAt[key];
    }
  },
  addArtworkAliases: (aliases: Record<string, string>) => {
    Object.assign(mockOfflineState.artworkAliases, aliases);
  },
  pruneArtworkAliases: (pendingTargets?: ReadonlySet<string>) => {
    for (const [key, target] of Object.entries(
      mockOfflineState.artworkAliases,
    )) {
      if (
        !mockOfflineState.artworkCache[target] &&
        !pendingTargets?.has(target)
      ) {
        delete mockOfflineState.artworkAliases[key];
      }
    }
  },
};

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => offlineStore },
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuthState },
}));
jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => ({ downloadsWifiOnly: false }) },
}));
jest.mock("@/services/network", () => ({
  getConnectionType: () => "wifi",
  getIsEffectivelyOnline: () => true,
  subscribeConnectionType: () => () => {},
  subscribeEffectiveOnline: () => () => {},
}));
jest.mock("@/services/errorReporting", () => ({
  isTlsTrustFailure: () => false,
}));
jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));
// Mirrors the real artworkUrl's two branches: an id that is already an absolute
// URL (a podcast feed image) is passed through, a server cover id becomes a
// getCoverArt request.
jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id: string) =>
    /^https?:/i.test(id) ? id : `https://server/cover/${id}`,
}));
jest.mock("@/services/offline/downloadDestination", () => ({
  internalArtworkDirectory: () => ({
    uri: "/doc/offline/scope/artwork",
    exists: true,
    create: () => {},
  }),
}));

const mockDownloads: string[] = [];
const mockFileDeletes: string[] = [];

jest.mock("expo-file-system", () => ({
  Paths: { document: "/doc" },
  File: class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((part) =>
          typeof part === "object" && part !== null && "uri" in part
            ? String((part as { uri: string }).uri)
            : String(part),
        )
        .join("/");
    }
    get exists() {
      return true;
    }
    delete() {
      mockFileDeletes.push(this.uri);
    }
    static downloadFileAsync(source: string, destination: { uri: string }) {
      mockDownloads.push(source);
      return Promise.resolve({
        uri: destination.uri,
        exists: true,
        delete: () => {},
      });
    }
  },
}));

import {
  artworkCacheService,
  cacheArtworkForTracks,
  getArtworkProgress,
  subscribePendingArtwork,
} from "@/services/offline/artworkCacheService";
import { ARTWORK_REFRESH_MS } from "@/services/offline/librarySyncPlan";

// The queue drains through promise callbacks, so let the microtask queue settle
// before asserting on what landed on disk.
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const song = (id: string, coverArt?: string, albumId?: string) => ({
  id,
  isDir: false,
  title: `Song ${id}`,
  coverArt,
  albumId,
});

beforeEach(() => {
  mockOfflineState.artworkCache = {};
  mockOfflineState.artworkCachedAt = {};
  mockOfflineState.artworkAliases = {};
  mockOfflineState.downloadedCollections = {};
  mockOfflineState.downloadedTracks = [];
  mockOfflineState.downloadQueue = [];
  mockAuthState.url = "https://server";
  mockAuthState.username = "n";
  mockAuthState.serverId = "s1";
  mockAuthState.serverType = "navidrome";
  mockDownloads.length = 0;
  mockFileDeletes.length = 0;
  artworkCacheService.reset();
});

describe("enqueue guards", () => {
  it("skips ids that are already a URI the server never issued", async () => {
    artworkCacheService.enqueue("file:///music/Album/cover.jpg");
    artworkCacheService.enqueue("data:image/png;base64,AAAA");
    await flush();
    expect(mockDownloads).toEqual([]);
  });

  it("caches a remote URL cover, which is what podcast episodes carry", async () => {
    artworkCacheService.enqueue("https://feed.example/cover.jpg");
    await flush();
    expect(mockDownloads).toHaveLength(1);
    expect(
      mockOfflineState.artworkCache["https://feed.example/cover.jpg"],
    ).toBeDefined();
  });

  it("skips a server cover id on an index-backed backend, which has no cover endpoint", async () => {
    mockAuthState.serverType = "local";
    artworkCacheService.enqueue("al-a1");
    await flush();
    expect(mockDownloads).toEqual([]);
  });

  // The one cover an index-backed backend does lose offline: an on-device
  // podcast's coverArt is the feed's image URL, not a file it extracted.
  it("caches a remote URL cover on an index-backed backend", async () => {
    mockAuthState.serverType = "local";
    artworkCacheService.enqueue("https://feed.example/cover.jpg");
    await flush();
    expect(mockDownloads).toEqual(["https://feed.example/cover.jpg"]);
  });

  it("skips a signed-out scope", async () => {
    mockAuthState.username = null;
    artworkCacheService.enqueue("al-a1");
    await flush();
    expect(mockDownloads).toEqual([]);
  });

  it("keeps a fresh cover but re-fetches a stale one", async () => {
    mockOfflineState.artworkCache["al-a1"] = "file:///artwork/al-a1_1.jpg";
    mockOfflineState.artworkCachedAt["al-a1"] = new Date().toISOString();
    artworkCacheService.enqueue("al-a1");
    await flush();
    expect(mockDownloads).toEqual([]);

    mockOfflineState.artworkCachedAt["al-a1"] = new Date(
      Date.now() - ARTWORK_REFRESH_MS - 1000,
    ).toISOString();
    artworkCacheService.enqueue("al-a1");
    await flush();
    expect(mockDownloads).toHaveLength(1);
  });

  it("dedupes an id already queued or in flight", async () => {
    artworkCacheService.enqueue("al-a1");
    artworkCacheService.enqueue("al-a1");
    // Navidrome re-issues the same cover under a new updated-at token; the
    // cache key strips it, so this is the same image.
    artworkCacheService.enqueue("al-a1_68e67692");
    await flush();
    expect(mockDownloads).toHaveLength(1);
  });

  it("reports pending covers and settles back to zero", async () => {
    const seen: number[] = [];
    const unsubscribe = subscribePendingArtwork(() => {
      seen.push(getArtworkProgress().pending);
    });
    artworkCacheService.enqueue("al-a1");
    expect(getArtworkProgress().pending).toBe(1);
    await flush();
    expect(getArtworkProgress().pending).toBe(0);
    expect(seen).toContain(0);
    unsubscribe();
  });
});

describe("cacheArtworkForTracks", () => {
  it("fetches the album's cover and aliases the track's onto it when the album is saved", async () => {
    mockOfflineState.downloadedCollections.a1 = { id: "a1", coverArt: "al-a1" };
    cacheArtworkForTracks([
      song("s1", "mf-s1", "a1"),
      song("s2", "mf-s2", "a1"),
    ]);
    await flush();
    expect(mockDownloads).toEqual(["https://server/cover/al-a1"]);
    expect(mockOfflineState.artworkAliases).toEqual({
      "mf-s1": "al-a1",
      "mf-s2": "al-a1",
    });
  });

  it("falls back to the track's own cover when its album isn't saved", async () => {
    cacheArtworkForTracks([song("s1", "mf-s1", "a1")]);
    await flush();
    expect(mockDownloads).toEqual(["https://server/cover/mf-s1"]);
    expect(mockOfflineState.artworkAliases).toEqual({});
  });

  // Saving a playlist is the case this exists for: its member albums aren't
  // registered collections, and Navidrome's per-track `mf-*` ids dedupe on
  // nothing — so without grouping this is one 600px download per track.
  it("fetches one cover per album even when the album isn't saved", async () => {
    cacheArtworkForTracks([
      song("s1", "mf-s1", "a1"),
      song("s2", "mf-s2", "a1"),
      song("s3", "mf-s3", "a2"),
    ]);
    await flush();
    expect(mockDownloads).toEqual([
      "https://server/cover/mf-s1",
      "https://server/cover/mf-s3",
    ]);
    expect(mockOfflineState.artworkAliases).toEqual({ "mf-s2": "mf-s1" });
  });
});

describe("backfill", () => {
  it("re-derives the track covers a restart would otherwise strand", async () => {
    mockOfflineState.downloadedCollections.a1 = { id: "a1", coverArt: "al-a1" };
    // Aliased onto the collection cover above, so it needs no fetch of its own.
    mockOfflineState.artworkAliases = { "mf-s1": "al-a1" };
    mockOfflineState.downloadedTracks = [
      { id: "s1", coverArt: "mf-s1" },
      { id: "s2", coverArt: "mf-s2" },
    ];
    mockOfflineState.downloadQueue = [{ id: "s3", coverArt: "mf-s3" }];

    artworkCacheService.backfill();
    await flush();

    expect(mockDownloads.sort()).toEqual([
      "https://server/cover/al-a1",
      "https://server/cover/mf-s2",
      "https://server/cover/mf-s3",
    ]);
  });
});

describe("pruneOrphaned", () => {
  it("keeps covers the user's own collections and tracks still reference", () => {
    mockOfflineState.artworkCache = {
      "al-a1": "file:///artwork/al-a1.jpg",
      "mf-s9": "file:///artwork/mf-s9.jpg",
      "al-gone": "file:///artwork/al-gone.jpg",
    };
    mockOfflineState.downloadedCollections.a1 = { id: "a1", coverArt: "al-a1" };
    mockOfflineState.downloadedTracks = [{ id: "s9", coverArt: "mf-s9" }];

    artworkCacheService.pruneOrphaned();

    expect(Object.keys(mockOfflineState.artworkCache).sort()).toEqual([
      "al-a1",
      "mf-s9",
    ]);
    expect(mockFileDeletes).toEqual(["file:///artwork/al-gone.jpg"]);
  });

  // A cover is fetched long before its audio lands, so between the two the track
  // is in the queue and not yet in downloadedTracks.
  it("keeps the cover of a download still in flight", () => {
    mockOfflineState.artworkCache = { "mf-s1": "file:///artwork/mf-s1.jpg" };
    mockOfflineState.downloadQueue = [{ id: "s1", coverArt: "mf-s1" }];

    artworkCacheService.pruneOrphaned();

    expect(Object.keys(mockOfflineState.artworkCache)).toEqual(["mf-s1"]);
    expect(mockFileDeletes).toEqual([]);
  });

  // Aliases are written the instant a save starts, while the cover they point at
  // is still queued. Dropping them here would leave those tracks on the fallback
  // icon and make the next backfill fetch one cover per track instead of one per
  // album.
  it("keeps the aliases of a cover that is still queued", async () => {
    mockOfflineState.artworkAliases = { "mf-s2": "mf-s1" };
    mockOfflineState.downloadQueue = [
      { id: "s1", coverArt: "mf-s1" },
      { id: "s2", coverArt: "mf-s2" },
    ];
    // Queued but not yet on disk: no flush, so the download is still in flight.
    artworkCacheService.enqueue("mf-s1");

    artworkCacheService.pruneOrphaned();

    expect(mockOfflineState.artworkAliases).toEqual({ "mf-s2": "mf-s1" });
    await flush();
  });

  it("drops the aliases that pointed at a pruned cover", () => {
    mockOfflineState.artworkCache = { "al-gone": "file:///artwork/gone.jpg" };
    mockOfflineState.artworkAliases = { "mf-s1": "al-gone" };

    artworkCacheService.pruneOrphaned();

    expect(mockOfflineState.artworkCache).toEqual({});
    expect(mockOfflineState.artworkAliases).toEqual({});
  });
});
