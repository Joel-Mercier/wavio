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

// Track / album / artist ids are *reversible* (the source value encoded behind a
// prefix) rather than hashed. For tracks this lets the synchronous stream-URL
// builder (utils/streaming.ts) recover the file URI straight from the id with no
// DB round-trip; for albums/artists it lets a screen holding only the id fetch
// that group's tracks without a separate id→key lookup table. The `local-`
// prefix keeps these from ever clashing with server-issued ids.
//
// The payload is **hex** (the UTF-8 bytes of the source value), deliberately not
// `encodeURIComponent`: these ids travel through expo-router navigation params,
// and `useLocalSearchParams` runs every param through `decodeURIComponent`. A
// percent-encoded payload (`file%3A%2F%2F…`) would be silently mangled by that
// decode (→ `file://…`), corrupting the id. Hex contains no `%`, so it's a fixed
// point of `decodeURIComponent` and survives navigation intact.
const TRACK_PREFIX = "local-track:";
const ALBUM_PREFIX = "local-album:";
const ARTIST_PREFIX = "local-artist:";
const PLAYLIST_PREFIX = "local-playlist:";
// Self-hosted podcast episodes encode their enclosure URL (like tracks encode
// their file URI) so the synchronous stream-URL builder (utils/streaming.ts) can
// recover the audio URL straight from the id — no DB round-trip — and the
// offline downloader can fetch it. The prefix uses a dash (not a colon) because
// this id doubles as a download filename (`<id>.<suffix>`), and hex contains no
// path-unsafe characters, so the whole id stays filesystem-safe.
const PODCAST_EPISODE_PREFIX = "local-pod-ep-";
const RADIO_PREFIX = "local-radio:";
const PODCAST_CHANNEL_PREFIX = "local-pod-ch:";

const encodePayload = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
};

const decodePayload = (hex: string): string => {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
};

/** Reversible id for a local track, encoding its file URI. */
export const localTrackId = (uri: string): string =>
  `${TRACK_PREFIX}${encodePayload(uri)}`;

export const localAlbumId = (key: string): string =>
  `${ALBUM_PREFIX}${encodePayload(key)}`;

export const localArtistId = (key: string): string =>
  `${ARTIST_PREFIX}${encodePayload(key)}`;

/** Recover the file URI from a local track id, or null if it isn't one. */
export const parseLocalTrackId = (id: string): string | null =>
  id.startsWith(TRACK_PREFIX)
    ? decodePayload(id.slice(TRACK_PREFIX.length))
    : null;

/** Recover the grouping key from a local album id, or null if it isn't one. */
export const parseLocalAlbumId = (id: string): string | null =>
  id.startsWith(ALBUM_PREFIX)
    ? decodePayload(id.slice(ALBUM_PREFIX.length))
    : null;

/** Recover the grouping key from a local artist id, or null if it isn't one. */
export const parseLocalArtistId = (id: string): string | null =>
  id.startsWith(ARTIST_PREFIX)
    ? decodePayload(id.slice(ARTIST_PREFIX.length))
    : null;

/** Reversible id for a self-hosted podcast episode, encoding its enclosure URL. */
export const localPodcastEpisodeId = (enclosureUrl: string): string =>
  `${PODCAST_EPISODE_PREFIX}${encodePayload(enclosureUrl)}`;

/** Recover the enclosure URL from a podcast-episode id, or null if it isn't one. */
export const parseLocalPodcastEpisodeId = (id: string): string | null =>
  id.startsWith(PODCAST_EPISODE_PREFIX)
    ? decodePayload(id.slice(PODCAST_EPISODE_PREFIX.length))
    : null;

// Playlist / radio-station / podcast-channel ids aren't reversible (they have no
// source value to encode); they're freshly minted on creation and looked up by
// id in SQLite. The prefix keeps them from clashing with track/album/artist ids
// or server-issued ones.
const mintId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const newLocalPlaylistId = (): string => mintId(PLAYLIST_PREFIX);

export const newLocalRadioStationId = (): string => mintId(RADIO_PREFIX);

export const newLocalPodcastChannelId = (): string =>
  mintId(PODCAST_CHANNEL_PREFIX);
