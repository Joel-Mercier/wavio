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

// Tolerance for the songs-phase completeness check: enumerating far fewer songs
// than the baseline means pages were truncated, so the pass has gaps and must
// not reconcile deletions. A tolerance rather than an equality because the
// baseline and the enumeration are gathered by different requests and can drift
// by a track or two across a pass. Undercounting the other way is fine: orphan
// songs outside any album push the ratio above 1.
export const SONG_ENUMERATION_MIN_RATIO = 0.95;

// What a completed pass measured about this server: how many songs it actually
// enumerated, and the albums phase's Σ songCount from that same pass. The two
// are only meaningful together — their ratio is the server's skew — so they are
// always written as a pair, by the pass that measured them.
export type SongEnumerationCalibration = {
  enumerableSongCount: number | null;
  calibratedAlbumSongEstimate: number | null;
};

// How many songs this pass's album inventory implies, at the skew measured when
// the calibration was taken. null until there is a calibration to scale.
function scaledAlbumExpectation(
  albumSongEstimate: number,
  calibration: SongEnumerationCalibration,
): number | null {
  const { enumerableSongCount, calibratedAlbumSongEstimate } = calibration;
  if (enumerableSongCount === null || !calibratedAlbumSongEstimate) return null;
  return Math.floor(
    albumSongEstimate * (enumerableSongCount / calibratedAlbumSongEstimate),
  );
}

/**
 * The denominator for the completeness check.
 *
 * The albums phase's Σ songCount is only a **bootstrap**. It counts rows the
 * server will never enumerate — Navidrome keeps `missing` media_files in
 * `album.song_count` long after the files leave disk — and that skew is
 * permanent, so a library that has ever been reorganised would fail the check
 * on every pass and silently never reconcile deletions again. Once a pass has
 * completed, what the server actually enumerated is the honest denominator.
 *
 * The album estimate still has one job after that, though: it is the only
 * signal that tracks *growth*. A measured count alone goes stale the moment the
 * library grows, and a stale-low baseline is exactly what a truncated pass
 * needs to pass as complete — import 10k tracks into a 62-track library and the
 * next pass truncated at 500 would clear the 62 baseline and reconcile away
 * everything it missed. So the measurement is scaled by how much the album
 * estimate has moved since it was taken, which carries the skew forward.
 *
 * Scaling only ever raises the baseline. A shrinking album estimate is a
 * *deletion* signal, and those go through the corroboration in
 * nextSongCalibration rather than being acted on the pass they appear.
 */
export function songEnumerationBaseline(
  albumSongEstimate: number,
  calibration: SongEnumerationCalibration,
): number {
  const { enumerableSongCount } = calibration;
  if (enumerableSongCount === null) return albumSongEstimate;
  const expectation = scaledAlbumExpectation(albumSongEstimate, calibration);
  return Math.max(enumerableSongCount, expectation ?? 0);
}

// Whether two pass counts agree closely enough to be describing the same
// library. Deliberately symmetric — neither reading is privileged.
function agreesWith(a: number, b: number): boolean {
  return (
    a >= Math.floor(b * SONG_ENUMERATION_MIN_RATIO) &&
    b >= Math.floor(a * SONG_ENUMERATION_MIN_RATIO)
  );
}

// Whether the songs phase enumerated enough of the library to be trusted with
// deletions. No baseline at all (an empty or non-reporting server) means
// there's nothing to cross-check against, so the pass is taken at face value —
// the anomaly guard in planServerDeletions still backstops the degenerate
// cases.
export function isSongEnumerationComplete(
  uniqueSeenSongs: number,
  baseline: number,
): boolean {
  if (baseline <= 0) return true;
  return uniqueSeenSongs >= Math.floor(baseline * SONG_ENUMERATION_MIN_RATIO);
}

// Whether the albums phase — an independent enumeration, over a different
// endpoint — moved with the songs count. A real server-side deletion shows up in
// both; a truncated songs page leaves Σ songCount where it was. That is what
// tells the two apart when consecutive passes report the same smaller number:
// the causes of truncation are mostly *deterministic* (a proxy response-size
// cap, a server that short-pages at a fixed offset, a crawl interrupted at the
// same point every time), so they repeat identically and would otherwise read as
// corroboration. Uncalibrated there is no measured skew and so nothing the
// album inventory can contradict — see nextSongCalibration.
function albumEstimateAgrees(
  uniqueSeenSongs: number,
  albumSongEstimate: number,
  calibration: SongEnumerationCalibration,
): boolean {
  const expectation = scaledAlbumExpectation(albumSongEstimate, calibration);
  return expectation === null || agreesWith(uniqueSeenSongs, expectation);
}

// Whether reconciling this pass could delete anything the pass did not itself
// enumerate. Only auto tracks are considered: user-saved content is never
// reconciled away. Deliberately ignores the user-collection references that
// spare a track in planServerDeletions — erring towards "yes" only costs an
// extra corroboration pass.
export function hasUnseenAutoTracks(
  tracks: Record<string, OfflineTrack>,
  seenSongIds: ReadonlySet<string>,
): boolean {
  return Object.values(tracks).some(
    (track) => track.source === "auto" && !seenSongIds.has(track.id),
  );
}

/**
 * The calibration to carry into the next pass.
 *
 * Raising it is always safe, so a trusted pass adopts what it saw. *Lowering*
 * it is the dangerous direction: a truncated pass that halved the count would
 * otherwise legitimise its own truncation on the following pass and delete
 * everything it failed to enumerate. So a smaller figure is only adopted once a
 * second pass has agreed with it *and* the albums phase — a separate endpoint,
 * with its own pagination — shows the library shrinking too. Repetition alone
 * is weak evidence, since truncation tends to be deterministic and so repeats
 * exactly; agreement between two independent enumerations is not.
 *
 * That applies to trusted passes too, which is why they take a max rather than
 * assigning: "trusted" only means within SONG_ENUMERATION_MIN_RATIO of the
 * baseline, so a chain of slightly-short passes each adopting its own count
 * would ratchet the baseline down 5% at a time, each step looking legitimate.
 * All downward movement goes through corroboration.
 *
 * The price is that a genuine bulk deletion server-side takes three passes to
 * reconcile instead of one: distrust, corroborate, then act. Deliberate — the
 * cost of waiting is a stale cache for ~45 minutes, the cost of being wrong is
 * deleting downloads the user still has.
 *
 * A first completed pass with nothing to lose calibrates directly, skipping the
 * corroboration it doesn't need: when every auto track was enqueued from the
 * pages this same pass enumerated, reconciliation is a no-op whatever the
 * verdict. That covers a fresh enable, but *not* an install upgrading into
 * calibration with a library already downloaded — there a truncated first pass
 * would write its own truncation in as the baseline and the next identically
 * truncated pass would reconcile against it. Two agreeing passes are all that
 * install has to go on: with no measured skew yet, Σ songCount is an unknown
 * multiple of the truth, so it can neither confirm nor contradict them.
 *
 * Either the whole measurement is adopted or none of it: pairing the count with
 * an album estimate from a different pass would misstate the skew.
 */
export function nextSongCalibration(args: {
  uniqueSeenSongs: number;
  albumSongEstimate: number;
  passTrusted: boolean;
  calibration: SongEnumerationCalibration;
  lastPassSongCount: number | null;
  unseenAutoTracks: boolean;
}): SongEnumerationCalibration {
  const {
    uniqueSeenSongs,
    albumSongEstimate,
    passTrusted,
    calibration,
    lastPassSongCount,
    unseenAutoTracks,
  } = args;
  const { enumerableSongCount } = calibration;
  const measured = {
    enumerableSongCount: uniqueSeenSongs,
    calibratedAlbumSongEstimate: albumSongEstimate,
  };
  if (passTrusted) {
    return uniqueSeenSongs > (enumerableSongCount ?? 0)
      ? measured
      : calibration;
  }
  if (enumerableSongCount === null && !unseenAutoTracks) return measured;
  if (lastPassSongCount === null) return calibration;
  const corroborated =
    agreesWith(uniqueSeenSongs, lastPassSongCount) &&
    albumEstimateAgrees(uniqueSeenSongs, albumSongEstimate, calibration);
  return corroborated ? measured : calibration;
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
    albumArtist: song.displayAlbumArtist ?? existing.albumArtist,
    year: song.year ?? existing.year,
    genre: song.genre?.trim() || song.genres?.[0]?.name || existing.genre,
    sortName: song.sortName ?? existing.sortName,
  };
  const unchanged =
    updated.title === existing.title &&
    updated.artist === existing.artist &&
    updated.album === existing.album &&
    updated.duration === existing.duration &&
    updated.coverArt === existing.coverArt &&
    updated.track === existing.track &&
    updated.discNumber === existing.discNumber &&
    updated.albumArtist === existing.albumArtist &&
    updated.year === existing.year &&
    updated.genre === existing.genre &&
    updated.sortName === existing.sortName;
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
