import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import type {
  AlbumID3,
  ArtistID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";
import { artworkCacheKey } from "@/utils/artworkCacheKey";

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

// A completed pass is re-run (from offset 0) once it's older than this,
// re-checked on every foreground/reconnect — the server is the source of
// truth, so additions, edits and deletions should reflect shortly after
// connectivity is established, not a day later. Already-downloaded tracks are
// skipped, so a resync costs only the enumeration requests; this floor just
// keeps rapid app-switching from re-crawling in a loop.
export const RESYNC_INTERVAL_MS = 15 * 60 * 1000;

// Cached covers older than this are re-fetched on the next pass, so a cover
// replaced on the server propagates even when its coverArt id is stable
// (Jellyfin item GUIDs; Navidrome ids already embed an updated-at token).
export const ARTWORK_REFRESH_MS = 24 * 60 * 60 * 1000;

// Backoff before retrying after a failed crawl step, so a failing server
// isn't hammered while still recovering without user action. Mirrors the
// offline-mutations replay backoff.
export const RETRY_BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000];

// Tolerance for the songs-phase completeness check. The albums phase's Σ
// songCount is an independent estimate of the library size, so enumerating far
// fewer songs than that means pages were truncated — the pass has gaps and must
// not reconcile deletions. It's a tolerance rather than an equality because a
// server's per-album songCount can legitimately disagree by a track or two
// (a file removed from disk but still counted in the album row). Undercounting
// the other way is fine: orphan songs outside any album push the ratio above 1.
export const SONG_ENUMERATION_MIN_RATIO = 0.95;

// Whether the songs phase enumerated enough of the library to be trusted with
// deletions. No album estimate (an empty or non-reporting server) means there's
// nothing to cross-check against, so the pass is taken at face value — the
// anomaly guard in planServerDeletions still backstops the degenerate cases.
export function isSongEnumerationComplete(
  uniqueSeenSongs: number,
  albumSongEstimate: number,
): boolean {
  if (albumSongEstimate <= 0) return true;
  return (
    uniqueSeenSongs >=
    Math.floor(albumSongEstimate * SONG_ENUMERATION_MIN_RATIO)
  );
}

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
    artists: album.artists,
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

// Covers are cached once per album/playlist/artist, never per track — a
// library's worth of per-file covers would be thousands of downloads of the
// same images. Track cover ids therefore need an alias onto the album cover
// that was actually cached; the two differ on most backends (Navidrome's
// `mf-*` vs `al-*`), so without it every track row falls back to its icon
// offline. Songs whose album isn't registered (orphans) get no alias.
export function buildTrackArtworkAliases(
  songs: Child[],
  collections: Record<string, OfflineCollection>,
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const song of songs) {
    if (!song.coverArt || !song.albumId) continue;
    const albumCoverArt = collections[song.albumId]?.coverArt;
    if (!albumCoverArt) continue;
    const from = artworkCacheKey(song.coverArt);
    const to = artworkCacheKey(albumCoverArt);
    if (from === to) continue;
    aliases[from] = to;
  }
  return aliases;
}

// Artist avatars are rendered from the artist's cover id in some places
// (ArtistDetail, ArtistListItem) and from the artist *id* in others (the
// AlbumDetail header, where Subsonic's getCoverArt accepts either), so both
// must resolve to the one cached file.
export function buildArtistArtworkAliases(
  artists: ArtistID3[],
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const artist of artists) {
    if (!artist.coverArt) continue;
    const from = artworkCacheKey(artist.id);
    const to = artworkCacheKey(artist.coverArt);
    if (from === to) continue;
    aliases[from] = to;
  }
  return aliases;
}

// Cover ids that must survive a prune: every collection's own cover, plus the
// cover of every artist still credited on a registered album. Aliases are
// pointers, so an artist stays cached exactly as long as one of their albums
// does — no separate artist inventory to reconcile.
export function referencedArtworkIds(
  collections: OfflineCollection[],
  artworkAliases: Record<string, string>,
): Set<string> {
  const referenced = new Set<string>();
  for (const collection of collections) {
    if (collection.coverArt) {
      referenced.add(artworkCacheKey(collection.coverArt));
    }
    const artistIds = [
      collection.artistId,
      ...(collection.artists ?? []).map((artist) => artist.id),
    ];
    for (const artistId of artistIds) {
      if (!artistId) continue;
      const key = artworkCacheKey(artistId);
      referenced.add(artworkAliases[key] ?? key);
    }
  }
  return referenced;
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

function isStale(
  timestamp: string | null | undefined,
  now: number,
  maxAgeMs: number,
): boolean {
  if (!timestamp) return true;
  const time = Date.parse(timestamp);
  return !Number.isFinite(time) || now - time >= maxAgeMs;
}

export const isSyncStale = (
  lastSyncCompletedAt: string | null,
  now: number,
): boolean => isStale(lastSyncCompletedAt, now, RESYNC_INTERVAL_MS);

export const isArtworkStale = (
  cachedAt: string | undefined,
  now: number,
): boolean => isStale(cachedAt, now, ARTWORK_REFRESH_MS);

// Server-side edits to an already-downloaded track (retitle, retag, renumber)
// must reach the offline copy without re-downloading the file. Returns the
// updated OfflineTrack, or null when nothing changed. Optional fields fall
// back to the stored value: some servers omit them from search3 results, and
// an omission must not wipe metadata captured from richer responses.
export function refreshedOfflineTrack(
  existing: OfflineTrack,
  song: Child,
): OfflineTrack | null {
  const updated: OfflineTrack = {
    ...existing,
    title: song.title,
    artist: song.artist ?? existing.artist,
    album: song.album ?? existing.album,
    duration: song.duration ?? existing.duration,
    coverArt: song.coverArt ?? existing.coverArt,
    track: song.track ?? existing.track,
    discNumber: song.discNumber ?? existing.discNumber,
  };
  const unchanged =
    updated.title === existing.title &&
    updated.artist === existing.artist &&
    updated.album === existing.album &&
    updated.duration === existing.duration &&
    updated.coverArt === existing.coverArt &&
    updated.track === existing.track &&
    updated.discNumber === existing.discNumber;
  return unchanged ? null : updated;
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

  // A pass that enumerated no albums *or* no songs is far more likely a
  // misbehaving server (a proxy answering empty 200s, a backend still warming
  // up) than a genuinely emptied library — don't let it wipe every download.
  // The two must be checked independently: a library with songs always has
  // albums, so an empty album inventory alongside a non-empty song inventory
  // is a broken pass, and treating it as truth would delete *every* auto album
  // collection. An actually-empty library needs no reconciliation anyway.
  if (seenAlbumIds.size === 0 || seenSongIds.size === 0) {
    return {
      removeCollectionIds: [],
      removeTrackIds: [],
      replaceAlbumTrackIds: {},
    };
  }

  const removeCollectionIds: string[] = [];
  const replaceAlbumTrackIds: Record<string, string[]> = {};
  const referencedByUser = trackIdsReferencedByCollections(
    Object.values(collections).filter(
      (collection) => collection.source !== "auto",
    ),
  );
  for (const collection of Object.values(collections)) {
    if (collection.source !== "auto") continue;
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
