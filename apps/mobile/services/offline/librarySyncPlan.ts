import type {
  AlbumID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";

// Pure crawl logic for the extended-offline library sync, kept free of stores
// and I/O so it can be unit-tested (see __tests__/librarySync.plan.test.ts).
// The stateful engine lives in services/offline/librarySyncService.ts.

export const ALBUM_PAGE_SIZE = 500;
export const SONG_PAGE_SIZE = 200;

// The next songs page is fetched only once the download queue has drained
// below this, so the persisted queue stays about a page deep and the crawl
// paces itself to download speed.
export const QUEUE_LOW_WATER = 50;

export const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024;

// A completed pass is re-run (from offset 0) after this long, picking up
// content added to the server since. Already-downloaded tracks are skipped, so
// a resync costs only the enumeration requests.
export const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function advanceCursor(
  offset: number,
  received: number,
  pageSize: number,
): { nextOffset: number; pageDone: boolean } {
  return { nextOffset: offset + received, pageDone: received < pageSize };
}

// A user-saved collection is never downgraded to auto: the sync only writes a
// collection slot that is empty or already owned by the sync.
export function shouldWriteAutoCollection(
  existing: OfflineCollection | undefined,
): boolean {
  return !existing || existing.source === "auto";
}

// Track ids accumulate during the songs phase (groupSongIdsByAlbum); on a
// resync the previous pass's ids are kept so the collection never loses tracks
// mid-crawl.
export function albumToAutoCollection(
  album: AlbumID3,
  existing: OfflineCollection | undefined,
): OfflineCollection {
  return {
    id: album.id,
    kind: "album",
    name: album.name,
    songCount: album.songCount ?? 0,
    trackIds: existing?.trackIds ?? [],
    coverArt: album.coverArt,
    artist: album.artist,
    artistId: album.artistId,
    year: album.year,
    savedAt: existing?.savedAt ?? new Date().toISOString(),
    source: "auto",
  };
}

export function playlistToAutoCollection(
  playlist: PlaylistWithSongs,
  existing: OfflineCollection | undefined,
): OfflineCollection {
  const trackIds = (playlist.entry ?? []).map((entry) => entry.id);
  return {
    id: playlist.id,
    kind: "playlist",
    name: playlist.name,
    songCount: playlist.songCount ?? trackIds.length,
    trackIds,
    coverArt: playlist.coverArt,
    owner: playlist.owner,
    savedAt: existing?.savedAt ?? new Date().toISOString(),
    source: "auto",
  };
}

export function groupSongIdsByAlbum(songs: Child[]): Map<string, string[]> {
  const byAlbum = new Map<string, string[]>();
  for (const song of songs) {
    if (!song.albumId) continue;
    const ids = byAlbum.get(song.albumId);
    if (ids) ids.push(song.id);
    else byAlbum.set(song.albumId, [song.id]);
  }
  return byAlbum;
}

export function isSyncStale(
  lastSyncCompletedAt: string | null,
  now: number,
): boolean {
  if (!lastSyncCompletedAt) return true;
  const completedAt = Date.parse(lastSyncCompletedAt);
  return (
    !Number.isFinite(completedAt) || now - completedAt >= RESYNC_INTERVAL_MS
  );
}

export type ServerDeletionPlan = {
  removeCollectionIds: string[];
  removeTrackIds: string[];
  // Auto album collections whose trackIds referenced now-deleted songs, with
  // the surviving ids. Playlists are excluded: their trackIds were rewritten
  // from the server during the pass that produced this plan.
  replaceAlbumTrackIds: Record<string, string[]>;
};

// The server is the source of truth: a completed pass has seen every id the
// server still has, so auto content whose id was never seen was deleted
// server-side and goes away locally. User-saved collections and tracks — and
// auto tracks they reference — are never touched, mirroring removeAutoContent.
// Only ever computed from a *complete* pass; an interrupted crawl has gaps
// that would read as deletions.
export function planServerDeletions(args: {
  collections: Record<string, OfflineCollection>;
  tracks: Record<string, OfflineTrack>;
  seenAlbumIds: ReadonlySet<string>;
  seenSongIds: ReadonlySet<string>;
  seenPlaylistIds: ReadonlySet<string>;
}): ServerDeletionPlan {
  const { collections, tracks, seenAlbumIds, seenSongIds, seenPlaylistIds } =
    args;

  // A pass that saw no albums and no songs at all is far more likely a
  // misbehaving server (a proxy answering empty 200s) than a genuinely emptied
  // library — don't let it wipe every download.
  if (seenAlbumIds.size === 0 && seenSongIds.size === 0) {
    return {
      removeCollectionIds: [],
      removeTrackIds: [],
      replaceAlbumTrackIds: {},
    };
  }

  const removeCollectionIds: string[] = [];
  const replaceAlbumTrackIds: Record<string, string[]> = {};
  const referencedByUser = new Set<string>();
  for (const collection of Object.values(collections)) {
    if (collection.source !== "auto") {
      for (const trackId of collection.trackIds) {
        referencedByUser.add(trackId);
      }
      continue;
    }
    const seen =
      collection.kind === "album"
        ? seenAlbumIds.has(collection.id)
        : seenPlaylistIds.has(collection.id);
    if (!seen) {
      removeCollectionIds.push(collection.id);
      continue;
    }
    if (collection.kind === "album") {
      const surviving = collection.trackIds.filter((id) => seenSongIds.has(id));
      if (surviving.length !== collection.trackIds.length) {
        replaceAlbumTrackIds[collection.id] = surviving;
      }
    }
  }

  const removeTrackIds: string[] = [];
  for (const track of Object.values(tracks)) {
    if (track.source !== "auto") continue;
    if (seenSongIds.has(track.id) || referencedByUser.has(track.id)) continue;
    removeTrackIds.push(track.id);
  }

  return { removeCollectionIds, removeTrackIds, replaceAlbumTrackIds };
}
