import {
  ARTWORK_REFRESH_MS,
  advanceCursor,
  albumToAutoCollection,
  buildArtistArtworkAliases,
  groupSongIdsByAlbum,
  hasUnseenAutoTracks,
  isArtworkStale,
  isSongEnumerationComplete,
  isSyncStale,
  nextSongCalibration,
  planServerDeletions,
  planTrackArtwork,
  playlistToAutoCollection,
  RESYNC_INTERVAL_MS,
  referencedArtworkIds,
  refreshedOfflineTrack,
  type SongEnumerationCalibration,
  shouldWriteAutoCollection,
  songEnumerationBaseline,
} from "@/services/offline/librarySyncPlan";
import type {
  AlbumID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";
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

const calibrated = (
  enumerableSongCount: number | null,
  calibratedAlbumSongEstimate: number | null,
): SongEnumerationCalibration => ({
  enumerableSongCount,
  calibratedAlbumSongEstimate,
});

describe("songEnumerationBaseline", () => {
  it("bootstraps from the album estimate before any pass has completed", () => {
    expect(songEnumerationBaseline(75, calibrated(null, null))).toBe(75);
  });

  it("prefers the measured count once calibrated", () => {
    // The album estimate counts rows the server never serves; the measurement
    // is what the server actually hands over.
    expect(songEnumerationBaseline(75, calibrated(62, 75))).toBe(62);
  });

  it("scales the measurement by how much the library has grown", () => {
    // 10x the albums, same 62/75 skew: a pass truncated at 500 must not read as
    // complete just because the last measurement was taken on a small library.
    expect(songEnumerationBaseline(750, calibrated(62, 75))).toBe(620);
  });

  it("never lets a shrinking album estimate lower the baseline", () => {
    // Shrinkage is a deletion signal, and deletions go through corroboration.
    expect(songEnumerationBaseline(30, calibrated(62, 75))).toBe(62);
  });

  it("falls back to the measurement when it has no album estimate paired", () => {
    expect(songEnumerationBaseline(750, calibrated(62, null))).toBe(62);
  });
});

describe("nextSongCalibration", () => {
  const next = (
    uniqueSeenSongs: number,
    passTrusted: boolean,
    calibration: SongEnumerationCalibration,
    lastPassSongCount: number | null,
    unseenAutoTracks = false,
    albumSongEstimate = 75,
  ) =>
    nextSongCalibration({
      uniqueSeenSongs,
      albumSongEstimate,
      passTrusted,
      calibration,
      lastPassSongCount,
      unseenAutoTracks,
    });

  it("calibrates from the first completed pass, trusted or not", () => {
    expect(next(62, false, calibrated(null, null), null)).toEqual(
      calibrated(62, 75),
    );
  });

  it("adopts what a trusted pass saw", () => {
    expect(next(80, true, calibrated(62, 75), 62, false, 90)).toEqual(
      calibrated(80, 90),
    );
  });

  it("ignores a single truncated pass rather than lowering the baseline", () => {
    // One pass seeing 30 where the library holds 62 is a hiccup. Adopting it
    // would make the *next* 30-song pass look trusted and delete 32 tracks.
    expect(next(30, false, calibrated(62, 75), 62)).toEqual(calibrated(62, 75));
  });

  it("adopts a lower count once a second pass and the albums agree", () => {
    // The albums phase shrank with it (75 → 36 at the same skew), so the
    // library really did lose half its songs.
    expect(next(30, false, calibrated(62, 75), 30, false, 36)).toEqual(
      calibrated(30, 36),
    );
  });

  it("rejects a repeated drop the albums phase does not corroborate", () => {
    // Same count twice, but Σ songCount says the library is untouched. The
    // causes of truncation are deterministic, so a second identical pass is no
    // evidence at all — it is the *second enumeration* that carries the weight.
    expect(next(30, false, calibrated(62, 75), 30, false, 75)).toEqual(
      calibrated(62, 75),
    );
  });

  it("holds the baseline when there is no previous pass to corroborate", () => {
    expect(next(30, false, calibrated(62, 75), null)).toEqual(
      calibrated(62, 75),
    );
  });

  it("never lowers the baseline on a trusted pass", () => {
    // A pass 5% short is still trusted; adopting its count would let the next
    // 5%-short pass do the same, ratcheting the baseline down indefinitely
    // while every step looks legitimate. Lowering goes through corroboration.
    expect(next(59, true, calibrated(62, 75), 62)).toEqual(calibrated(62, 75));
  });

  it("defers calibration when auto downloads predate the first pass", () => {
    // An install upgrading into calibration already holds a downloaded library.
    // A truncated first pass must not write its own truncation in as the
    // baseline, or the next identically truncated pass reconciles against it.
    expect(next(30, false, calibrated(null, null), null, true)).toEqual(
      calibrated(null, null),
    );
  });

  it("calibrates a corroborated count once auto downloads exist", () => {
    expect(next(30, false, calibrated(null, null), 30, true)).toEqual(
      calibrated(30, 75),
    );
  });
});

// Mirrors the songs-phase completion step in librarySyncService, so the
// calibration regressions below exercise the sequence the crawl actually runs.
const calibrationRun = () => {
  let calibration = calibrated(null, null);
  let lastPassSongCount: number | null = null;
  return {
    get calibration() {
      return calibration;
    },
    runPass(args: {
      uniqueSeenSongs: number;
      albumSongEstimate: number;
      unseenAutoTracks?: boolean;
    }) {
      const { uniqueSeenSongs, albumSongEstimate } = args;
      const baseline = songEnumerationBaseline(albumSongEstimate, calibration);
      const passTrusted = isSongEnumerationComplete(uniqueSeenSongs, baseline);
      calibration = nextSongCalibration({
        uniqueSeenSongs,
        albumSongEstimate,
        passTrusted,
        calibration,
        lastPassSongCount,
        unseenAutoTracks: args.unseenAutoTracks ?? false,
      });
      lastPassSongCount = uniqueSeenSongs;
      return passTrusted;
    },
  };
};

// The bug this guards against: Navidrome counts `missing` media_files in
// album.song_count but never serves them, so Σ songCount permanently overstates
// what the crawl can enumerate. Under the old album-estimate-only check every
// pass failed, which silently disabled deletion reconciliation forever.
describe("song enumeration calibration (regression: stale album songCount)", () => {
  it("self-heals to the enumerable count and then reconciles again", () => {
    const albumSongEstimate = 75; // 62 servable + 13 `missing` rows
    const enumerated = 62;
    const sync = calibrationRun();
    // A fresh enable: every auto track was enqueued from the pages the pass
    // enumerating it just walked, so nothing predates the enumeration.
    const runPass = (uniqueSeenSongs: number) =>
      sync.runPass({ uniqueSeenSongs, albumSongEstimate });

    // First pass is judged against the inflated bootstrap and so is distrusted,
    // which is harmless — it is also the pass that measures the truth.
    expect(runPass(enumerated)).toBe(false);
    expect(sync.calibration.enumerableSongCount).toBe(enumerated);

    // From here on the baseline is honest and every full pass is trusted, so
    // deletions reconcile normally.
    expect(runPass(enumerated)).toBe(true);
    expect(runPass(enumerated)).toBe(true);

    // A genuinely truncated pass is still caught, and does not drag the
    // baseline down with it.
    expect(runPass(20)).toBe(false);
    expect(sync.calibration.enumerableSongCount).toBe(enumerated);

    // Recovery needs no intervention.
    expect(runPass(enumerated)).toBe(true);
  });
});

// The bug this guards against: once measured, the baseline was used alone and
// went stale the moment the library grew — leaving a truncated pass free to
// clear a baseline several times smaller than the library and reconcile away
// everything it had failed to enumerate.
describe("song enumeration calibration (regression: library growth)", () => {
  it("catches a truncated pass after a bulk import", () => {
    const sync = calibrationRun();

    // Calibrate on a small library: 62 servable of 75 counted rows.
    expect(sync.runPass({ uniqueSeenSongs: 62, albumSongEstimate: 75 })).toBe(
      false,
    );
    expect(sync.calibration).toEqual(calibrated(62, 75));

    // 10k tracks are imported server-side, and the very next pass truncates at
    // 500. The album estimate grew with the library, so the scaled baseline
    // (~9900) catches it even though 500 clears the measured 62.
    expect(
      sync.runPass({ uniqueSeenSongs: 500, albumSongEstimate: 12_000 }),
    ).toBe(false);
    expect(sync.calibration).toEqual(calibrated(62, 75));

    // A complete pass over the grown library recalibrates.
    expect(
      sync.runPass({ uniqueSeenSongs: 9800, albumSongEstimate: 12_000 }),
    ).toBe(true);
    expect(sync.calibration).toEqual(calibrated(9800, 12_000));
  });
});

// The bug this guards against: corroboration by repetition assumed truncation
// was random, but its causes are deterministic — a proxy response-size cap, a
// server short-paging at a fixed offset, a crawl interrupted at the same point
// each time. Those repeat *exactly*, so a second identical pass read as
// confirmation of a shrunken library and the third deleted against it.
describe("song enumeration calibration (regression: deterministic truncation)", () => {
  it("never adopts a repeated truncation the albums phase contradicts", () => {
    const sync = calibrationRun();
    const capped = { uniqueSeenSongs: 30, albumSongEstimate: 75 };

    expect(sync.runPass({ uniqueSeenSongs: 62, albumSongEstimate: 75 })).toBe(
      false,
    );
    expect(sync.calibration).toEqual(calibrated(62, 75));

    // A cap now truncates every pass at exactly 30 while the album inventory
    // still reports the whole library. However often that repeats, it is never
    // trusted and never lowers the baseline.
    for (let pass = 0; pass < 5; pass++) {
      expect(sync.runPass(capped)).toBe(false);
      expect(sync.calibration).toEqual(calibrated(62, 75));
    }

    // Lift the cap and the very next pass reconciles again.
    expect(sync.runPass({ uniqueSeenSongs: 62, albumSongEstimate: 75 })).toBe(
      true,
    );
  });
});

describe("hasUnseenAutoTracks", () => {
  const track = (id: string, source: "user" | "auto"): OfflineTrack =>
    ({ id, source }) as OfflineTrack;

  it("is false when every auto track was enumerated by the pass", () => {
    const tracks = { a: track("a", "auto"), b: track("b", "auto") };
    expect(hasUnseenAutoTracks(tracks, new Set(["a", "b", "c"]))).toBe(false);
  });

  it("is true for an auto track the pass never saw", () => {
    const tracks = { a: track("a", "auto"), b: track("b", "auto") };
    expect(hasUnseenAutoTracks(tracks, new Set(["a"]))).toBe(true);
  });

  it("ignores user downloads, which are never reconciled away", () => {
    const tracks = { a: track("a", "auto"), b: track("b", "user") };
    expect(hasUnseenAutoTracks(tracks, new Set(["a"]))).toBe(false);
  });
});

// The bug this guards against: an install upgrading into calibration starts
// with enumerableSongCount null while already holding a downloaded library, so
// the first-pass exemption would let a truncated pass write its own truncation
// in as the baseline — and the next identically truncated pass would then be
// "trusted" and delete everything it failed to enumerate.
describe("song enumeration calibration (regression: upgrade with downloads)", () => {
  it("refuses to calibrate from an uncorroborated truncated pass", () => {
    const albumSongEstimate = 10_000;
    const sync = calibrationRun();
    const runPass = (uniqueSeenSongs: number, unseenAutoTracks: boolean) =>
      sync.runPass({ uniqueSeenSongs, albumSongEstimate, unseenAutoTracks });

    // Truncated, and the 10k already-downloaded tracks predate it.
    expect(runPass(3000, true)).toBe(false);
    expect(sync.calibration.enumerableSongCount).toBeNull();

    // Truncated again at a different offset: no corroboration, so still no
    // baseline and still no deletions.
    expect(runPass(4000, true)).toBe(false);
    expect(sync.calibration.enumerableSongCount).toBeNull();

    // A complete pass calibrates honestly and restores reconciliation.
    expect(runPass(10_000, false)).toBe(true);
    expect(sync.calibration.enumerableSongCount).toBe(10_000);
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

  // Documents *why* librarySyncService.canProceed() bails out while a
  // canonical-id migration is pending (see isIdMigrationFrozen). Navidrome's
  // migration renumbers most song ids, so a pass run before the local remap
  // enumerates an inventory of entirely new ids while every stored id is the
  // old one. Nothing here can tell that apart from a mass server-side deletion,
  // and it shouldn't try to: the anomaly guards don't fire (the pass is
  // complete and non-empty), so it plans to delete every downloaded file. The
  // freeze is the only thing standing between an upgrade and data loss.
  it("would delete every auto download after a server-side id renumbering", () => {
    const result = plan({
      collections: {
        a1: makeCollection({
          id: "a1",
          source: "auto",
          trackIds: ["s1", "s2"],
        }),
      },
      tracks: {
        s1: makeOfflineTrack("s1", "auto"),
        s2: makeOfflineTrack("s2", "auto"),
      },
      // Album ids are hash-derived and survive; song ids were renumbered.
      seenAlbums: ["a1"],
      seenSongs: ["6VHl3uR4kss6sUPKA8Cwnk", "7rke2SAWaicSeSYzkhww6R"],
    });
    expect(result.removeTrackIds.sort()).toEqual(["s1", "s2"]);
    expect(result.replaceAlbumTrackIds).toEqual({ a1: [] });
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

describe("planTrackArtwork", () => {
  const collections = {
    a1: makeCollection({ id: "a1", coverArt: "al-a1" }),
    a2: makeCollection({ id: "a2", coverArt: undefined }),
  };

  it("points a track cover at its album's cached cover", () => {
    const songs = [
      { ...makeSong("s1", "a1"), coverArt: "mf-s1" },
      { ...makeSong("s2", "a1"), coverArt: "mf-s2" },
    ];
    expect(planTrackArtwork(songs, collections)).toEqual({
      aliases: { "mf-s1": "al-a1", "mf-s2": "al-a1" },
      covers: ["al-a1"],
    });
  });

  // A playlist's member albums are usually not registered collections, and on
  // Navidrome every track carries its own `mf-*` id — so without grouping this
  // is one 600px download per track of the same album.
  it("collapses an unregistered album onto its first member's cover", () => {
    const songs = [
      { ...makeSong("s1", "unsaved"), coverArt: "mf-s1" },
      { ...makeSong("s2", "unsaved"), coverArt: "mf-s2" },
      { ...makeSong("s3", "unsaved"), coverArt: "mf-s3" },
    ];
    expect(planTrackArtwork(songs, {})).toEqual({
      aliases: { "mf-s2": "mf-s1", "mf-s3": "mf-s1" },
      covers: ["mf-s1"],
    });
  });

  // Saving the same playlist twice must not fetch a second copy of the cover an
  // earlier batch already cached.
  it("reuses the target an earlier batch aliased the album onto", () => {
    const songs = [
      { ...makeSong("s2", "unsaved"), coverArt: "mf-s2" },
      { ...makeSong("s3", "unsaved"), coverArt: "mf-s3" },
    ];
    expect(planTrackArtwork(songs, {}, { "mf-s2": "mf-s1" })).toEqual({
      aliases: { "mf-s2": "mf-s1", "mf-s3": "mf-s1" },
      covers: [],
    });
  });

  it("aliases nothing for tracks with no album, no cover, or an identical id, but still fetches their covers", () => {
    const songs = [
      { ...makeSong("s1"), coverArt: "mf-s1" },
      makeSong("s2", "a1"),
      { ...makeSong("s3", "a2"), coverArt: "mf-s3" },
      { ...makeSong("s4", "a1"), coverArt: "al-a1" },
      { ...makeSong("s5", "missing"), coverArt: "mf-s5" },
    ];
    expect(planTrackArtwork(songs, collections)).toEqual({
      aliases: {},
      covers: ["al-a1", "mf-s1", "mf-s3", "mf-s5"],
    });
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
  const downloadedTrack = (id: string, coverArt?: string): OfflineTrack =>
    ({ id, coverArt }) as OfflineTrack;

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
      [],
      { "ar-1": "ar-cover-1" },
    );
    expect(referenced).toEqual(
      new Set(["al-a1", "al-a2", "ar-cover-1", "ar-2"]),
    );
  });

  it("drops the cover of an artist whose albums are all gone", () => {
    const referenced = referencedArtworkIds([], [], { "ar-1": "ar-cover-1" });
    expect(referenced.has("ar-cover-1")).toBe(false);
  });

  it("keeps the cover of a standalone downloaded track", () => {
    const referenced = referencedArtworkIds(
      [],
      [downloadedTrack("s1", "mf-s1")],
      {},
    );
    expect(referenced.has("mf-s1")).toBe(true);
  });

  it("resolves an aliased track cover to the album cover actually on disk", () => {
    const referenced = referencedArtworkIds(
      [],
      [downloadedTrack("s1", "mf-s1_1752710400")],
      { "mf-s1": "al-a1" },
    );
    expect(referenced).toEqual(new Set(["al-a1"]));
  });

  it("drops the cover of a track that is no longer downloaded", () => {
    const referenced = referencedArtworkIds([], [], {});
    expect(referenced.has("mf-s1")).toBe(false);
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
