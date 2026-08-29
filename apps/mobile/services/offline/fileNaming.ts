import { sanitizePathSegment } from "@/utils/safeFileName";

// Pure naming rules for downloaded files. Kept free of store/config imports so
// the read-side consumers (offline collection mapping, the player's quality
// line) can use them without pulling the app store — and its i18n/zod chain —
// into a plain data mapper.

const UNKNOWN_ARTIST_DIR = "Unknown artist";
const UNKNOWN_ALBUM_DIR = "Unknown album";

// Structurally satisfied by both `Child` (what a download starts from, where the
// album artist is `displayAlbumArtist`) and `OfflineTrack` (what deletion works
// from, where the same value was persisted as `albumArtist`). Both must resolve
// to the same folder or a delete would prune a directory the download never
// wrote to.
export type DestinationTrack = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  displayAlbumArtist?: string;
  albumArtist?: string;
  track?: number;
  discNumber?: number;
};

export function albumSegments(track: DestinationTrack): [string, string] {
  const artist =
    sanitizePathSegment(track.displayAlbumArtist) ||
    sanitizePathSegment(track.albumArtist) ||
    sanitizePathSegment(track.artist) ||
    UNKNOWN_ARTIST_DIR;
  const album = sanitizePathSegment(track.album) || UNKNOWN_ALBUM_DIR;
  return [artist, album];
}

// `NN - Title.ext`, disc-prefixed only past the first disc (we never know the
// disc total, so `1-` on a single-disc album would be noise).
export function exportFileName(
  track: DestinationTrack,
  suffix: string,
): string {
  const title = sanitizePathSegment(track.title);
  if (!title) return `${track.id}.${suffix}`;

  const parts: string[] = [];
  if (track.discNumber && track.discNumber > 1) {
    parts.push(`${track.discNumber}-`);
  }
  if (track.track && track.track > 0) {
    parts.push(`${String(track.track).padStart(2, "0")} - `);
  }
  return `${parts.join("")}${title}.${suffix}`;
}

// The container a downloaded file actually is. Prefers the suffix recorded at
// download time; older records predate that field and have to fall back to
// parsing `path`, which only works because an app-private download is named
// `<id>.<suffix>` — the fallback is wrong for a `content://` path, but no
// download old enough to lack `fileSuffix` can have one.
export function downloadedFileSuffix(track: {
  path: string;
  fileSuffix?: string;
}): string | undefined {
  return track.fileSuffix ?? track.path.split(".").pop();
}
