import {
  ARTWORK_REFRESH_MS,
  advanceCursor,
  albumToAutoCollection,
  buildArtistArtworkAliases,
  buildTrackArtworkAliases,
  groupSongIdsByAlbum,
  isArtworkStale,
  isSongEnumerationComplete,
  isSyncStale,
  planServerDeletions,
  playlistToAutoCollection,
  RESYNC_INTERVAL_MS,
  referencedArtworkIds,
  refreshedOfflineTrack,
  shouldWriteAutoCollection,
} from "@/services/offline/librarySyncPlan";
import type {
  AlbumID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection } from "@/stores/offline";
import { artworkCacheKey } from "@/utils/artworkCacheKey";

const makeAlbum = (
  id: string,
  overrides: Partial<AlbumID3> = {},
): AlbumID3 => ({
  id,
  name: `Album ${id}`,
  songCount: 10,
  duration: 1800,
  created: new Date("2026-01-01"),
  artist: "Artist",
  artistId: "ar-1",
  coverArt: `al-${id}`,
  year: 2020,
  ...overrides,
});

const makeSong = (id: string, albumId?: string): Child => ({
  id,
  isDir: false,
  title: `Song ${id}`,
  albumId,
});

const makeCollection = (
  overrides: Partial<OfflineCollection> = {},
): OfflineCollection => ({
  id: "a1",
  kind: "album",
  name: "Album a1",
  songCount: 10,
  trackIds: [],
  savedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("advanceCursor", () => {
  it("advances by the received count", () => {
    expect(advanceCursor(0, 500, 500)).toEqual({
      nextOffset: 500,
      pageDone: false,
    });
    expect(advanceCursor(500, 500, 500)).toEqual({
      nextOffset: 1000,
      pageDone: false,
    });
  });

  it("flags the end on a short page", () => {
    expect(advanceCursor(1000, 123, 500)).toEqual({
      nextOffset: 1123,
      pageDone: true,
    });
  });

  it("flags the end on an empty page", () => {
    expect(advanceCursor(1000, 0, 500)).toEqual({
      nextOffset: 1000,
      pageDone: true,
    });
  });
});

describe("shouldWriteAutoCollection", () => {
  it("writes an empty slot", () => {
    expect(shouldWriteAutoCollection(undefined)).toBe(true);
  });

  it("overwrites a previous auto collection", () => {
    expect(shouldWriteAutoCollection(makeCollection({ source: "auto" }))).toBe(
      true,
    );
  });

  it("never downgrades a user-saved collection (explicit or legacy)", () => {
    expect(shouldWriteAutoCollection(makeCollection({ source: "user" }))).toBe(
      false,
    );
    expect(shouldWriteAutoCollection(makeCollection())).toBe(false);
  });
});

describe("albumToAutoCollection", () => {
  it("maps album metadata and marks the collection auto", () => {
    const collection = albumToAutoCollection(makeAlbum("a1"), undefined);
    expect(collection).toMatchObject({
      id: "a1",
      kind: "album",
      name: "Album a1",
      songCount: 10,
      trackIds: [],
      artist: "Artist",
      artistId: "ar-1",
      coverArt: "al-a1",
      year: 2020,
      source: "auto",
    });
  });

  it("carries every credited artist so multi-artist albums stay browsable", () => {
    const collection = albumToAutoCollection(
      makeAlbum("a1", {
        artists: [
          { id: "ar-1", name: "Artist" },
          { id: "ar-2", name: "Second Artist" },
        ],
      }),
      undefined,
    );
    expect(collection.artists).toEqual([
      { id: "ar-1", name: "Artist" },
      { id: "ar-2", name: "Second Artist" },
    ]);
  });

  it("keeps trackIds and savedAt accumulated by a previous pass", () => {
    const existing = makeCollection({
      source: "auto",
      trackIds: ["s1", "s2"],
      savedAt: "2026-01-01T00:00:00.000Z",
    });
    const collection = albumToAutoCollection(makeAlbum("a1"), existing);
    expect(collection.trackIds).toEqual(["s1", "s2"]);
    expect(collection.savedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("playlistToAutoCollection", () => {
  it("takes trackIds from the playlist entries in order", () => {
    const playlist: PlaylistWithSongs = {
      id: "p1",
      name: "Mix",
      songCount: 3,
      duration: 600,
      owner: "joel",
      changed: new Date(),
      created: new Date(),
      entry: [makeSong("s3"), makeSong("s1"), makeSong("s2")],
    };
    const collection = playlistToAutoCollection(playlist, undefined);
    expect(collection).toMatchObject({
      id: "p1",
      kind: "playlist",
      trackIds: ["s3", "s1", "s2"],
      owner: "joel",
      source: "auto",
    });
  });
});

describe("groupSongIdsByAlbum", () => {
  it("groups page songs by albumId, skipping orphans", () => {
    const grouped = groupSongIdsByAlbum([
      makeSong("s1", "a1"),
      makeSong("s2", "a2"),
      makeSong("s3", "a1"),
      makeSong("s4"),
    ]);
    expect(Array.from(grouped.entries())).toEqual([
      ["a1", ["s1", "s3"]],
      ["a2", ["s2"]],
    ]);
  });
});

describe("isSyncStale", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");

  it("is stale when never completed or unparseable", () => {
    expect(isSyncStale(null, now)).toBe(true);
    expect(isSyncStale("not a date", now)).toBe(true);
  });

  it("is fresh within the resync interval", () => {
    const recent = new Date(now - RESYNC_INTERVAL_MS + 60_000).toISOString();
    expect(isSyncStale(recent, now)).toBe(false);
  });

  it("is stale past the resync interval", () => {
    const old = new Date(now - RESYNC_INTERVAL_MS - 60_000).toISOString();
    expect(isSyncStale(old, now)).toBe(true);
  });
});

describe("isSongEnumerationComplete", () => {
  it("trusts a pass that enumerated the whole album estimate", () => {
    expect(isSongEnumerationComplete(47, 47)).toBe(true);
  });

  it("trusts a pass that exceeds the estimate (orphan songs outside albums)", () => {
    expect(isSongEnumerationComplete(60, 47)).toBe(true);
  });

  it("tolerates a small disagreement in per-album songCount", () => {
    expect(isSongEnumerationComplete(96, 100)).toBe(true);
  });

  it("distrusts a pass that enumerated far fewer songs than the estimate", () => {
    expect(isSongEnumerationComplete(16, 47)).toBe(false);
    expect(isSongEnumerationComplete(0, 47)).toBe(false);
  });

  it("trusts the pass when there is no album estimate to check against", () => {
    expect(isSongEnumerationComplete(0, 0)).toBe(true);
  });
});

describe("planServerDeletions", () => {
  const makeOfflineTrack = (
    id: string,
    source?: "user" | "auto",
  ): import("@/stores/offline").OfflineTrack => ({
    id,
    title: `Song ${id}`,
    duration: 180,
    path: `/tmp/${id}.mp3`,
    size: 1000,
    downloadedAt: "2026-07-01T00:00:00.000Z",
    source,
  });

  const plan = (args: {
    collections?: Record<string, OfflineCollection>;
    tracks?: Record<string, import("@/stores/offline").OfflineTrack>;
    seenAlbums?: string[];
    seenSongs?: string[];
    seenPlaylists?: string[];
  }) =>
    planServerDeletions({
      collections: args.collections ?? {},
      tracks: args.tracks ?? {},
      seenAlbumIds: new Set(args.seenAlbums ?? []),
      seenSongIds: new Set(args.seenSongs ?? []),
      seenPlaylistIds: new Set(args.seenPlaylists ?? []),
    });

  it("removes auto collections the pass never saw", () => {
    const result = plan({
      collections: {
        a1: makeCollection({ id: "a1", source: "auto" }),
        a2: makeCollection({ id: "a2", source: "auto" }),
        p1: makeCollection({ id: "p1", kind: "playlist", source: "auto" }),
      },
      seenAlbums: ["a1"],
      seenSongs: ["s1"],
      seenPlaylists: [],
    });
    expect(result.removeCollectionIds.sort()).toEqual(["a2", "p1"]);
  });

  it("never removes user-saved collections or their tracks", () => {
    const result = plan({
      collections: {
        a1: makeCollection({ id: "a1", trackIds: ["s1", "s2"] }),
      },
      tracks: {
        s1: makeOfflineTrack("s1", "auto"),
        s2: makeOfflineTrack("s2"),
      },
      seenAlbums: ["other"],
      seenSongs: ["other-song"],
    });
    expect(result.removeCollectionIds).toEqual([]);
    // s1 is auto but referenced by the surviving user collection; s2 is user.
    expect(result.removeTrackIds).toEqual([]);
  });

  it("removes unreferenced auto tracks the pass never saw", () => {
    const result = plan({
      tracks: {
        s1: makeOfflineTrack("s1", "auto"),
        s2: makeOfflineTrack("s2", "auto"),
        s3: makeOfflineTrack("s3"),
      },
      seenAlbums: ["a1"],
      seenSongs: ["s1"],
    });
    expect(result.removeTrackIds).toEqual(["s2"]);
  });

  it("prunes deleted songs from surviving auto albums, not playlists", () => {
    const result = plan({
      collections: {
        a1: makeCollection({
          id: "a1",
          source: "auto",
          trackIds: ["s1", "s2"],
        }),
        p1: makeCollection({
          id: "p1",
          kind: "playlist",
          source: "auto",
          trackIds: ["s1", "s2"],
        }),
      },
      seenAlbums: ["a1"],
      seenSongs: ["s1"],
      seenPlaylists: ["p1"],
    });
    expect(result.replaceAlbumTrackIds).toEqual({ a1: ["s1"] });
    expect(result.removeCollectionIds).toEqual([]);
  });

  it("leaves untouched albums out of replaceAlbumTrackIds", () => {
    const result = plan({
      collections: {
        a1: makeCollection({
          id: "a1",
          source: "auto",
          trackIds: ["s1", "s2"],
        }),
      },
      seenAlbums: ["a1"],
      seenSongs: ["s1", "s2"],
    });
    expect(result.replaceAlbumTrackIds).toEqual({});
  });

  it("plans nothing when the pass saw no albums and no songs (anomalous pass)", () => {
    const result = plan({
      collections: {
        a1: makeCollection({ id: "a1", source: "auto" }),
      },
      tracks: { s1: makeOfflineTrack("s1", "auto") },
      seenAlbums: [],
      seenSongs: [],
      seenPlaylists: ["p1"],
    });
    expect(result).toEqual({
      removeCollectionIds: [],
      removeTrackIds: [],
      replaceAlbumTrackIds: {},
    });
  });

  // A pass whose album page came back empty while songs enumerated fine used to
  // sail past the anomaly guard and delete every auto album collection.
  it("plans nothing when the pass saw songs but no albums", () => {
    const result = plan({
      collections: {
        a1: makeCollection({ id: "a1", source: "auto", trackIds: ["s1"] }),
        a2: makeCollection({ id: "a2", source: "auto" }),
      },
      tracks: {
        s1: makeOfflineTrack("s1", "auto"),
        s2: makeOfflineTrack("s2", "auto"),
      },
      seenAlbums: [],
      seenSongs: ["s1"],
    });
    expect(result).toEqual({
      removeCollectionIds: [],
      removeTrackIds: [],
      replaceAlbumTrackIds: {},
    });
  });

  it("plans nothing when the pass saw albums but no songs", () => {
    const result = plan({
      collections: {
        a1: makeCollection({ id: "a1", source: "auto", trackIds: ["s1"] }),
      },
      tracks: { s1: makeOfflineTrack("s1", "auto") },
      seenAlbums: ["a1"],
      seenSongs: [],
    });
    expect(result).toEqual({
      removeCollectionIds: [],
      removeTrackIds: [],
      replaceAlbumTrackIds: {},
    });
  });
});

describe("refreshedOfflineTrack", () => {
  const existing: import("@/stores/offline").OfflineTrack = {
    id: "s1",
    title: "Old title",
    artist: "Old artist",
    album: "Old album",
    duration: 180,
    coverArt: "al-1",
    path: "/tmp/s1.mp3",
    size: 1000,
    downloadedAt: "2026-07-01T00:00:00.000Z",
    source: "auto",
    track: 1,
    discNumber: 1,
  };

  it("returns null when nothing changed", () => {
    const song = makeSong("s1");
    expect(
      refreshedOfflineTrack(existing, {
        ...song,
        title: "Old title",
        artist: "Old artist",
        album: "Old album",
        duration: 180,
        coverArt: "al-1",
        track: 1,
        discNumber: 1,
      }),
    ).toBeNull();
  });

  it("applies server edits while keeping file identity fields", () => {
    const refreshed = refreshedOfflineTrack(existing, {
      ...makeSong("s1"),
      title: "New title",
      artist: "New artist",
      album: "Old album",
      duration: 200,
      coverArt: "al-2",
      track: 3,
      discNumber: 2,
    });
    expect(refreshed).toMatchObject({
      id: "s1",
      title: "New title",
      artist: "New artist",
      duration: 200,
      coverArt: "al-2",
      track: 3,
      discNumber: 2,
      path: "/tmp/s1.mp3",
      size: 1000,
      downloadedAt: "2026-07-01T00:00:00.000Z",
      source: "auto",
    });
  });

  it("keeps the stored duration when the server omits it", () => {
    const refreshed = refreshedOfflineTrack(existing, {
      ...makeSong("s1"),
      title: "New title",
    });
    expect(refreshed?.duration).toBe(180);
  });

  it("preserves optional fields a sparse search3 result omits", () => {
    // Some servers omit track/disc/artist/cover in search results; an
    // omission must not wipe metadata captured from richer responses.
    const refreshed = refreshedOfflineTrack(existing, {
      id: "s1",
      isDir: false,
      title: "New title",
    });
    expect(refreshed).toMatchObject({
      title: "New title",
      artist: "Old artist",
      album: "Old album",
      coverArt: "al-1",
      track: 1,
      discNumber: 1,
      duration: 180,
    });
  });
});

describe("isArtworkStale", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");

  it("is stale when never fetched or unparseable", () => {
    expect(isArtworkStale(undefined, now)).toBe(true);
    expect(isArtworkStale("nope", now)).toBe(true);
  });

  it("is fresh within the refresh window and stale past it", () => {
    const fresh = new Date(now - ARTWORK_REFRESH_MS + 60_000).toISOString();
    const old = new Date(now - ARTWORK_REFRESH_MS - 60_000).toISOString();
    expect(isArtworkStale(fresh, now)).toBe(false);
    expect(isArtworkStale(old, now)).toBe(true);
  });
});

describe("buildTrackArtworkAliases", () => {
  const collections = {
    a1: makeCollection({ id: "a1", coverArt: "al-a1" }),
    a2: makeCollection({ id: "a2", coverArt: undefined }),
  };

  it("points a track cover at its album's cached cover", () => {
    const songs = [
      { ...makeSong("s1", "a1"), coverArt: "mf-s1" },
      { ...makeSong("s2", "a1"), coverArt: "mf-s2" },
    ];
    expect(buildTrackArtworkAliases(songs, collections)).toEqual({
      "mf-s1": "al-a1",
      "mf-s2": "al-a1",
    });
  });

  it("skips tracks with no album, no cover, an uncached album cover, or an identical id", () => {
    const songs = [
      { ...makeSong("s1"), coverArt: "mf-s1" },
      makeSong("s2", "a1"),
      { ...makeSong("s3", "a2"), coverArt: "mf-s3" },
      { ...makeSong("s4", "a1"), coverArt: "al-a1" },
      { ...makeSong("s5", "missing"), coverArt: "mf-s5" },
    ];
    expect(buildTrackArtworkAliases(songs, collections)).toEqual({});
  });
});

describe("buildArtistArtworkAliases", () => {
  it("maps artist ids onto their cover ids, skipping identical or missing ones", () => {
    expect(
      buildArtistArtworkAliases([
        { id: "ar-1", name: "One", albumCount: 2, coverArt: "ar-cover-1" },
        { id: "ar-2", name: "Two", albumCount: 1, coverArt: "ar-2" },
        { id: "ar-3", name: "Three", albumCount: 1 },
      ]),
    ).toEqual({ "ar-1": "ar-cover-1" });
  });
});

describe("referencedArtworkIds", () => {
  it("keeps collection covers and the covers of their credited artists", () => {
    const referenced = referencedArtworkIds(
      [
        makeCollection({ id: "a1", coverArt: "al-a1", artistId: "ar-1" }),
        makeCollection({
          id: "a2",
          coverArt: "al-a2",
          artistId: "ar-1",
          artists: [
            { id: "ar-1", name: "One" },
            { id: "ar-2", name: "Two" },
          ],
        }),
      ],
      { "ar-1": "ar-cover-1" },
    );
    expect(referenced).toEqual(
      new Set(["al-a1", "al-a2", "ar-cover-1", "ar-2"]),
    );
  });

  it("drops the cover of an artist whose albums are all gone", () => {
    const referenced = referencedArtworkIds([], { "ar-1": "ar-cover-1" });
    expect(referenced.has("ar-cover-1")).toBe(false);
  });
});

describe("artworkCacheKey", () => {
  it("strips Navidrome's updated-at token so a re-evaluated entity keeps its cover", () => {
    expect(artworkCacheKey("pl-abc123_1752710400")).toBe("pl-abc123");
    expect(artworkCacheKey("al-abc123_1752710400")).toBe("al-abc123");
    expect(artworkCacheKey("ar-abc123_1752710400")).toBe("ar-abc123");
    expect(artworkCacheKey("mf-abc123_1752710400")).toBe("mf-abc123");
  });

  it("strips the token whatever its encoding (hex unix time, or a bare 0)", () => {
    expect(artworkCacheKey("al-0r5mStvRua5Uzh2XlXeHiV_68e67692")).toBe(
      "al-0r5mStvRua5Uzh2XlXeHiV",
    );
    expect(artworkCacheKey("ar-5uciksYRLuOaA9qD3plrp5_0")).toBe(
      "ar-5uciksYRLuOaA9qD3plrp5",
    );
    expect(artworkCacheKey("mf-K4YKRIwVNEsQLiS5jJwmf3_68baadab")).toBe(
      "mf-K4YKRIwVNEsQLiS5jJwmf3",
    );
  });

  it("leaves ids that don't carry a token alone", () => {
    expect(artworkCacheKey("al-abc123")).toBe("al-abc123");
    expect(artworkCacheKey("8f3c1e2a4b5d6f7a")).toBe("8f3c1e2a4b5d6f7a");
    expect(artworkCacheKey("song_12345")).toBe("song_12345");
    expect(artworkCacheKey("pl-abc123")).toBe("pl-abc123");
  });
});
