import {
  advanceCursor,
  albumToAutoCollection,
  groupSongIdsByAlbum,
  isSyncStale,
  planServerDeletions,
  playlistToAutoCollection,
  RESYNC_INTERVAL_MS,
  shouldWriteAutoCollection,
} from "@/services/offline/librarySyncPlan";
import type {
  AlbumID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection } from "@/stores/offline";

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
});
