// The automatic downloads (liked songs, liked albums, playlists) driven end to
// end against a mocked server: what each listing registers and queues, and what
// unliking, excluding or switching a rule off releases.

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    createDynamicScopedStorage: () => make(),
    createThrottledScopedJSONStorage: () =>
      jest.requireActual("zustand/middleware").createJSONStorage(() => make()),
    flushPendingScopedWrites: () => {},
  };
});

const mockAuth = {
  url: "https://server",
  username: "joel",
  serverType: "navidrome",
  userId: "u1",
};
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("@/services/backend/capabilities", () => ({
  getCapabilities: () => ({ offlineDownload: true }),
}));

const mockGetStarred2 = jest.fn();
jest.mock("@/services/backend/lists", () => ({
  getStarred2: () => mockGetStarred2(),
}));

const mockGetPlaylists = jest.fn();
jest.mock("@/services/backend/playlists", () => ({
  getPlaylists: () => mockGetPlaylists(),
}));

const mockGetPlaylistsByOwner = jest.fn();
jest.mock("@/services/navidrome/playlists", () => ({
  getPlaylistsByOwner: (id: string) => mockGetPlaylistsByOwner(id),
}));

let mockOnline = true;
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
  subscribeEffectiveOnline: () => () => {},
}));

jest.mock("@/services/backgroundTimer", () => ({
  backgroundSleep: () => Promise.resolve(),
}));

jest.mock("@/services/offline/artworkCacheService", () => ({
  artworkCacheService: { enqueue: () => {}, pruneOrphaned: () => {} },
  cacheArtworkForTracks: () => {},
}));

const mockLoadAlbum = jest.fn();
const mockLoadPlaylist = jest.fn();
jest.mock("@/services/offline/collectionAdoption", () => ({
  loadAlbumMembership: (id: string) => mockLoadAlbum(id),
  loadPlaylistMembership: (id: string) => mockLoadPlaylist(id),
}));

const mockEnqueue = jest.fn();
const mockRemoveTracks = jest.fn();
const mockCancelQueued = jest.fn();
jest.mock("@/services/offline/downloadService", () => {
  const service = {
    enqueueTracks: (tracks: unknown, source: unknown) =>
      mockEnqueue(tracks, source),
    isRemovingCollection: () => false,
    cancelQueuedTracks: (ids: string[]) => mockCancelQueued(ids),
    removeDownloadedTracks: (ids: string[], onProgress?: unknown) =>
      mockRemoveTracks(ids, onProgress),
  };
  return { offlineDownloadService: service };
});
jest.mock("@/services/offline", () => ({
  offlineDownloadService: jest.requireMock("@/services/offline/downloadService")
    .offlineDownloadService,
}));

let mockExtendedOffline = false;
jest.mock("@/stores/librarySync", () => ({
  isIdMigrationFrozen: () => false,
  useLibrarySyncBase: {
    getState: () => ({ extendedOfflineModeEnabled: mockExtendedOffline }),
  },
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

import { autoDownloadService } from "@/services/offline/autoDownloadService";
import type { AlbumID3, Child, Playlist } from "@/services/openSubsonic/types";
import useOffline, {
  type OfflineSource,
  type OfflineTrack,
} from "@/stores/offline";

const child = (id: string): Child => ({ id, isDir: false, title: id });

const album = (id: string, songCount = 2): AlbumID3 =>
  ({ id, name: id, songCount, duration: songCount * 100 }) as AlbumID3;

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: id,
  owner: "joel",
  songCount: 1,
  duration: 1,
  created: new Date("2026-01-01T00:00:00.000Z"),
  changed: new Date("2026-01-01T00:00:00.000Z"),
  ...extra,
});

const track = (id: string, source: OfflineSource = "rule"): OfflineTrack => ({
  id,
  title: id,
  duration: 1,
  path: `/doc/${id}.mp3`,
  size: 1,
  downloadedAt: "2026-11-01T00:00:00.000Z",
  source,
});

const membership = (id: string, kind: "album" | "playlist", ids: string[]) => ({
  item: { id },
  meta: { id, kind, name: id },
  entries: ids.map(child),
});

const starred = (albums: AlbumID3[], songs: Child[] = []) => ({
  starred2: { album: albums, song: songs, artist: [] },
});

const state = () => useOffline.getState();
const collections = () => state().downloadedCollections;
const enqueuedIds = () =>
  mockEnqueue.mock.calls.flatMap(([tracks]) =>
    (tracks as Child[]).map((t) => t.id),
  );

beforeEach(() => {
  autoDownloadService.reset();
  state().__reset();
  useOffline.persist.rehydrate();
  mockOnline = true;
  mockExtendedOffline = false;
  mockGetStarred2.mockReset().mockResolvedValue(starred([]));
  mockGetPlaylists.mockReset().mockResolvedValue({ playlists: {} });
  mockGetPlaylistsByOwner.mockReset().mockResolvedValue([]);
  mockLoadAlbum.mockReset();
  mockLoadPlaylist.mockReset();
  mockEnqueue.mockReset();
  mockCancelQueued.mockReset();
  mockRemoveTracks
    .mockReset()
    .mockImplementation(async (ids: string[]) =>
      state().removeManyDownloadedTracks(ids),
    );
});

describe("liked albums", () => {
  it("registers each liked album as an automatic download and queues its tracks", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a", "b"]));

    await autoDownloadService.setRuleEnabled("likedAlbums", true);

    expect(collections().al1).toMatchObject({
      source: "rule",
      trackIds: ["a", "b"],
      ruleVersion: "2|200",
    });
    expect(enqueuedIds()).toEqual(["a", "b"]);
    expect(mockEnqueue.mock.calls[0][1]).toBe("rule");
  });

  it("doesn't fetch an album again while it is unchanged and complete", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a", "b"]));
    await autoDownloadService.setRuleEnabled("likedAlbums", true);
    state().addDownloadedTracks([track("a"), track("b")]);

    await autoDownloadService.kick({ force: true });

    expect(mockLoadAlbum).toHaveBeenCalledTimes(1);
  });

  it("deletes an unliked album's download once the server confirms it", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a", "b"]));
    await autoDownloadService.setRuleEnabled("likedAlbums", true);
    state().addDownloadedTracks([track("a"), track("b")]);

    mockGetStarred2.mockResolvedValue(starred([]));
    await autoDownloadService.kick({ force: true });

    // An empty listing is asked twice before anything is deleted.
    expect(mockGetStarred2).toHaveBeenCalledTimes(3);
    expect(collections().al1).toBeUndefined();
    expect(mockRemoveTracks.mock.calls[0][0]).toEqual(["a", "b"]);
  });

  it("keeps everything when an empty listing doesn't hold on a second look", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a"]));
    await autoDownloadService.setRuleEnabled("likedAlbums", true);
    state().addDownloadedTracks([track("a")]);

    mockGetStarred2
      .mockResolvedValueOnce(starred([]))
      .mockResolvedValueOnce(starred([album("al1", 1)]));
    await autoDownloadService.kick({ force: true });

    expect(collections().al1?.source).toBe("rule");
    expect(mockRemoveTracks).not.toHaveBeenCalled();
  });

  it("skips an excluded album and never overwrites one the user saved", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1"), album("al2")]));
    state().updateAutoDownloadOverrides({
      "album:al1": { mode: "exclude", kind: "album", name: "al1" },
    });
    state().addDownloadedCollection({
      id: "al2",
      kind: "album",
      name: "al2",
      songCount: 1,
      trackIds: ["x"],
      savedAt: "2026-11-01T00:00:00.000Z",
    });

    await autoDownloadService.setRuleEnabled("likedAlbums", true);

    expect(mockLoadAlbum).not.toHaveBeenCalled();
    expect(collections().al1).toBeUndefined();
    expect(collections().al2.source).toBeUndefined();
  });

  it("deletes what the rule held when it is switched off, even offline", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a"]));
    await autoDownloadService.setRuleEnabled("likedAlbums", true);
    state().addDownloadedTracks([track("a")]);
    mockOnline = false;
    const onProgress = jest.fn();
    expect(autoDownloadService.holdsContent("likedAlbums")).toBe(true);

    await autoDownloadService.setRuleEnabled("likedAlbums", false, onProgress);

    expect(collections().al1).toBeUndefined();
    expect(mockRemoveTracks).toHaveBeenCalledWith(["a"], onProgress);
  });

  it("hands its downloads to the library sync instead while that is on", async () => {
    mockGetStarred2.mockResolvedValue(starred([album("al1")]));
    mockLoadAlbum.mockResolvedValue(membership("al1", "album", ["a"]));
    await autoDownloadService.setRuleEnabled("likedAlbums", true);
    state().addDownloadedTracks([track("a")]);
    mockExtendedOffline = true;
    expect(autoDownloadService.holdsContent("likedAlbums")).toBe(false);

    await autoDownloadService.setRuleEnabled("likedAlbums", false);

    expect(mockRemoveTracks).not.toHaveBeenCalled();
    expect(collections().al1.source).toBe("auto");
    expect(collections().al1.ruleVersion).toBeUndefined();
    expect(state().downloadedTracks.a.source).toBe("auto");
  });
});

describe("empty collections", () => {
  it("never fetches an empty playlist, and releases one emptied on the server", async () => {
    mockGetPlaylists.mockResolvedValue({
      playlists: {
        playlist: [playlist("empty", { songCount: 0 }), playlist("p1")],
      },
    });
    mockLoadPlaylist.mockImplementation(async (id: string) =>
      membership(id, "playlist", ["a"]),
    );
    await autoDownloadService.setRuleEnabled("playlists", true);
    state().addDownloadedTracks([track("a")]);

    expect(mockLoadPlaylist.mock.calls.map(([id]) => id)).toEqual(["p1"]);

    mockGetPlaylists.mockResolvedValue({
      playlists: {
        playlist: [
          playlist("p1", {
            songCount: 0,
            changed: new Date("2026-11-02T00:00:00.000Z"),
          }),
        ],
      },
    });
    mockLoadPlaylist.mockImplementation(async (id: string) =>
      membership(id, "playlist", []),
    );
    await autoDownloadService.kick({ force: true });

    expect(collections().p1.trackIds).toEqual([]);
    expect(mockRemoveTracks.mock.calls[0][0]).toEqual(["a"]);
  });
});

describe("liked songs", () => {
  it("queues the liked songs it isn't excluded from and remembers the listing", async () => {
    mockGetStarred2.mockResolvedValue(
      starred([], [child("a"), child("b"), child("c")]),
    );
    state().updateAutoDownloadOverrides({
      "song:b": { mode: "exclude", kind: "song", name: "b" },
    });

    await autoDownloadService.setRuleEnabled("likedSongs", true);

    expect(enqueuedIds()).toEqual(["a", "c"]);
    expect(state().likedSongIds).toEqual(["a", "b", "c"]);
  });

  it("deletes an unliked song but not one another download still lists", async () => {
    mockGetStarred2.mockResolvedValue(starred([], [child("a"), child("b")]));
    await autoDownloadService.setRuleEnabled("likedSongs", true);
    state().addDownloadedTracks([track("a"), track("b")]);
    state().addDownloadedCollection({
      id: "mine",
      kind: "playlist",
      name: "mine",
      songCount: 1,
      trackIds: ["b"],
      savedAt: "2026-11-01T00:00:00.000Z",
    });

    mockGetStarred2.mockResolvedValue(starred([], [child("c")]));
    await autoDownloadService.kick({ force: true });

    expect(mockRemoveTracks.mock.calls[0][0]).toEqual(["a"]);
  });

  it("forgets the listing when switched off, so a later restart can't act on it", async () => {
    mockGetStarred2.mockResolvedValue(starred([], [child("a")]));
    await autoDownloadService.setRuleEnabled("likedSongs", true);

    await autoDownloadService.setRuleEnabled("likedSongs", false);

    expect(state().likedSongIds).toBeNull();
  });
});

describe("playlists", () => {
  it("downloads only the user's own playlists, leaving smart ones out by default", async () => {
    mockGetPlaylists.mockResolvedValue({
      playlists: {
        playlist: [
          playlist("mine"),
          playlist("theirs", { owner: "someone" }),
          playlist("smart", { validUntil: "2026-11-03T00:00:00Z" }),
          playlist("ndSmart"),
        ],
      },
    });
    mockGetPlaylistsByOwner.mockResolvedValue([
      { id: "ndSmart", name: "ndSmart", rules: { all: [] } },
    ]);
    mockLoadPlaylist.mockImplementation(async (id: string) =>
      membership(id, "playlist", [`${id}-t`]),
    );

    await autoDownloadService.setRuleEnabled("playlists", true);

    expect(mockGetPlaylistsByOwner).toHaveBeenCalledWith("u1");
    expect(mockLoadPlaylist.mock.calls.map(([id]) => id)).toEqual(["mine"]);
    expect(collections().mine.source).toBe("rule");
  });

  it("downloads a smart playlist the user opted in, and drops one they opt out", async () => {
    const smart = playlist("smart", { validUntil: "2026-11-03T00:00:00Z" });
    const mine = playlist("mine");
    mockGetPlaylists.mockResolvedValue({
      playlists: { playlist: [smart, mine] },
    });
    mockLoadPlaylist.mockImplementation(async (id: string) =>
      membership(id, "playlist", [`${id}-t`]),
    );
    await autoDownloadService.setRuleEnabled("playlists", true);

    await autoDownloadService.setPlaylistIncluded(smart, true, true);
    await autoDownloadService.setPlaylistIncluded(mine, false, false);

    expect(collections().smart?.source).toBe("rule");
    expect(collections().mine).toBeUndefined();
    expect(state().autoDownloadOverrides).toEqual({
      "playlist:smart": { mode: "include", kind: "playlist", name: "smart" },
      "playlist:mine": { mode: "exclude", kind: "playlist", name: "mine" },
    });
  });
});

describe("offline", () => {
  it("doesn't list the server while it is unreachable", async () => {
    mockOnline = false;

    await autoDownloadService.setRuleEnabled("likedAlbums", true);

    expect(mockGetStarred2).not.toHaveBeenCalled();
  });
});
