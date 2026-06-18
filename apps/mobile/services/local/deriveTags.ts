// Heuristic tag recovery for local files whose embedded metadata is missing or
// incomplete — common for random MP3s on a phone. Mirrors how file-based players
// (Poweramp, Musicolet, VLC) classify untagged music: embedded tags win, then
// the filename ("Artist - Title", track-number prefixes), then the folder layout
// (".../Artist/Album/01 Title.mp3"). Without this every untagged track gets an
// empty artist/album key and collapses into one hidden "Unknown" bucket, so it
// never surfaces in the Albums/Artists lists or the home screen.
//
// Pure and dependency-free so it's trivially unit-testable; the indexer feeds it
// the file path + name and the partial metadata it managed to extract.

import type { AudioMetadata } from "@/modules/audio-metadata";

// Folder names that carry no artist/album meaning — download sinks, OS dirs,
// storage volume roots. Used to reject a folder as an artist/album source (but a
// generic folder is still accepted as a last-resort album so files at least
// group by their directory instead of one global bucket).
const GENERIC_FOLDERS = new Set([
  "music",
  "musique",
  "musik",
  "download",
  "downloads",
  "media",
  "audio",
  "sound",
  "sounds",
  "song",
  "songs",
  "track",
  "tracks",
  "mp3",
  "mp3s",
  "flac",
  "telegram",
  "whatsapp",
  "whatsapp audio",
  "bluetooth",
  "received",
  "sdcard",
  "sd card",
  "storage",
  "emulated",
  "primary",
  "documents",
  "document",
  "dcim",
  "android",
  "data",
  "files",
  "new folder",
  "misc",
  "temp",
  "tmp",
]);

const EXT_RE = /\.[^./]+$/;
const SPLIT_RE = /\s+-\s+/;

function basename(value: string): string {
  return value.replace(EXT_RE, "").trim();
}

function isGenericFolder(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (GENERIC_FOLDERS.has(n)) return true;
  // Pure numbers ("0" external-storage id) and SD-card volume ids ("ABCD-1234").
  if (/^\d+$/.test(n)) return true;
  if (/^[0-9a-f]{4}-[0-9a-f]{4}$/i.test(n)) return true;
  return false;
}

// A standalone 1–3 digit segment is a track number, not an artist/title.
function asTrackNumber(segment: string): number | undefined {
  return /^\d{1,3}$/.test(segment.trim())
    ? Number.parseInt(segment, 10)
    : undefined;
}

// Strip a leading "01 ", "01. ", "01 - ", "01) " track-number prefix.
function stripLeadingTrackNumber(value: string): {
  trackNumber?: number;
  rest: string;
} {
  const m = value.match(/^(\d{1,3})\s*[-._)\]]?\s+(.+)$/);
  if (m?.[2]?.trim()) {
    return { trackNumber: Number.parseInt(m[1], 10), rest: m[2].trim() };
  }
  return { rest: value };
}

export type ParsedFileName = {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
};

/**
 * Parse "Artist - Title", "NN - Title", "Artist - Album - NN - Title" and
 * leading-track-number filename conventions. Only the title is guaranteed; the
 * rest are filled when the shape is unambiguous.
 */
export function parseFileName(fileName: string): ParsedFileName {
  const base = basename(fileName);
  if (!base) return {};

  const segments = base
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const { trackNumber, rest } = stripLeadingTrackNumber(base);
    return { title: rest, trackNumber };
  }

  // Pull a numeric "03" segment out as the track number, keep the named ones.
  let trackNumber: number | undefined;
  const named: string[] = [];
  for (const seg of segments) {
    const n = asTrackNumber(seg);
    if (n != null && trackNumber == null) trackNumber = n;
    else named.push(seg);
  }

  if (named.length === 0) return { trackNumber };
  if (named.length === 1) {
    const lead = stripLeadingTrackNumber(named[0]);
    return { title: lead.rest, trackNumber: trackNumber ?? lead.trackNumber };
  }

  // First segment = artist, last = title, any middle = album.
  return {
    artist: named[0],
    album: named.length >= 3 ? named[named.length - 2] : undefined,
    title: named[named.length - 1],
    trackNumber,
  };
}

export type DerivedTags = {
  title: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
};

/**
 * Fill missing title/artist/album/track for a local file. `path` is the file's
 * absolute path (scheme stripped is fine); `fileName` is its basename. Embedded
 * metadata always wins; heuristics only fill the gaps.
 */
export function deriveTrackTags(
  path: string,
  fileName: string,
  m: AudioMetadata,
): DerivedTags {
  const fromName = parseFileName(fileName);

  const parts = path
    .replace(/^file:\/\//, "")
    .split("/")
    .filter(Boolean);
  // parts[last] is the file itself.
  const parentName = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  const grandparentName =
    parts.length >= 3 ? parts[parts.length - 3] : undefined;

  const folderAlbum =
    parentName && !isGenericFolder(parentName) ? parentName : undefined;
  const folderArtist =
    grandparentName && !isGenericFolder(grandparentName)
      ? grandparentName
      : undefined;

  const title = m.title || fromName.title || basename(fileName);
  const artist = m.artist || fromName.artist || folderArtist || undefined;
  let album = m.album || fromName.album || folderAlbum || undefined;

  // Last resort: a file with no derivable artist *and* no album would otherwise
  // pool into one global "Unknown album". Group it by its containing folder
  // (even a generic name) so each directory becomes its own navigable album.
  if (!artist && !album && parentName) album = parentName;

  return {
    title,
    artist,
    album,
    trackNumber: m.trackNumber ?? fromName.trackNumber,
  };
}
