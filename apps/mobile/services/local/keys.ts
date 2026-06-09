// Stable id + grouping-key helpers shared by the indexer and read queries.
// Kept tiny and dependency-free so they're trivially unit-testable.

/** Lowercased, whitespace-collapsed key for album/artist grouping. */
export function normalizeKey(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Album grouping key. Combines album title with its album-artist (falling back
 * to the track artist) so two different albums that share a title — or a
 * "Greatest Hits" per artist — don't collapse into one.
 */
export function albumKey(
  album: string | undefined | null,
  albumArtist: string | undefined | null,
  artist: string | undefined | null,
): string {
  return `${normalizeKey(album)} ${normalizeKey(albumArtist || artist)}`;
}

// Track / album / artist ids are *reversible* (the source value URL-encoded
// behind a prefix) rather than hashed. For tracks this lets the synchronous
// stream-URL builder (utils/streaming.ts) recover the file URI straight from the
// id with no DB round-trip; for albums/artists it lets a screen holding only the
// id fetch that group's tracks without a separate id→key lookup table. The
// `local-` prefix keeps these from ever clashing with server-issued ids.
const TRACK_PREFIX = "local-track:";
const ALBUM_PREFIX = "local-album:";
const ARTIST_PREFIX = "local-artist:";

/** Reversible id for a local track, encoding its file URI. */
export const localTrackId = (uri: string): string =>
  `${TRACK_PREFIX}${encodeURIComponent(uri)}`;

export const localAlbumId = (key: string): string =>
  `${ALBUM_PREFIX}${encodeURIComponent(key)}`;

export const localArtistId = (key: string): string =>
  `${ARTIST_PREFIX}${encodeURIComponent(key)}`;

/** Recover the file URI from a local track id, or null if it isn't one. */
export const parseLocalTrackId = (id: string): string | null =>
  id.startsWith(TRACK_PREFIX)
    ? decodeURIComponent(id.slice(TRACK_PREFIX.length))
    : null;

/** Recover the grouping key from a local album id, or null if it isn't one. */
export const parseLocalAlbumId = (id: string): string | null =>
  id.startsWith(ALBUM_PREFIX)
    ? decodeURIComponent(id.slice(ALBUM_PREFIX.length))
    : null;

/** Recover the grouping key from a local artist id, or null if it isn't one. */
export const parseLocalArtistId = (id: string): string | null =>
  id.startsWith(ARTIST_PREFIX)
    ? decodeURIComponent(id.slice(ARTIST_PREFIX.length))
    : null;
