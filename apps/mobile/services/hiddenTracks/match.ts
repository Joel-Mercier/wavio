import { isIndexBackedType } from "@/services/backend/serverTraits";
import { localArtistId, normalizeKey } from "@/services/local/keys";
import type { ServerType } from "@/stores/servers";
import { isLibraryTrack } from "@/utils/trackSource";

export type HiddenMatchable = {
  id: string;
  isRadio?: boolean;
  source?: unknown;
  artist?: string;
  artistId?: string;
  artists?: { id?: string; name?: string }[] | null;
};

export type HiddenIndex = {
  tracks: Record<string, unknown>;
  artists: Record<string, unknown>;
  allowed: Record<string, { artistKeys: readonly string[] }>;
};

export type HiddenReason = "track" | "artist" | null;

const hasOwn = Object.prototype.hasOwnProperty;

const has = (record: Record<string, unknown>, key: string | undefined) =>
  key != null && hasOwn.call(record, key);

export const isRecordEmpty = (record: Record<string, unknown>): boolean => {
  for (const _ in record) return false;
  return true;
};

export const isHiddenIndexEmpty = (index: HiddenIndex): boolean =>
  isRecordEmpty(index.tracks) && isRecordEmpty(index.artists);

// The ids an artist block can match a track by: every track artist plus
// `artistId`, which names the track artist on Subsonic, the album artist on
// Jellyfin (mapBaseItemToChild) and the album-artist group on the index-backed
// libraries. Jellyfin needs the album artist because it never splits
// "A feat. B" into separate artists, so a block of A would otherwise miss the
// tracks its own page lists. The index-backed libraries' `artists[]` all carry
// the group's id, so co-artists are matched by name: a local artist id is the
// hex of its normalized name.
export function artistMatchKeys(
  track: HiddenMatchable,
  serverType: ServerType | undefined,
): string[] {
  const artists = track.artists ?? [];
  if (serverType && isIndexBackedType(serverType)) {
    const keys = track.artistId ? [track.artistId] : [];
    const names =
      artists.length > 0
        ? artists.map((artist) => artist.name)
        : [track.artist];
    for (const name of names) {
      const key = normalizeKey(name);
      if (key) keys.push(localArtistId(key));
    }
    return keys;
  }
  const keys: string[] = [];
  for (const artist of artists) {
    if (artist.id) keys.push(artist.id);
  }
  if (track.artistId) keys.push(track.artistId);
  return keys;
}

// An exception only covers the blocks it was granted against, so a later block
// of a co-artist hides the track again.
export function blockedArtistKey(
  index: HiddenIndex,
  track: HiddenMatchable,
  serverType: ServerType | undefined,
): string | null {
  if (isRecordEmpty(index.artists)) return null;
  const excepted = has(index.allowed, track.id)
    ? index.allowed[track.id].artistKeys
    : null;
  for (const key of artistMatchKeys(track, serverType)) {
    if (has(index.artists, key) && !excepted?.includes(key)) return key;
  }
  return null;
}

export function hiddenReason(
  index: HiddenIndex,
  track: HiddenMatchable,
  serverType: ServerType | undefined,
): HiddenReason {
  if (!isLibraryTrack(track)) return null;
  if (has(index.tracks, track.id)) return "track";
  return blockedArtistKey(index, track, serverType) ? "artist" : null;
}

export function filterHidden<T extends HiddenMatchable>(
  tracks: T[],
  index: HiddenIndex,
  serverType: ServerType | undefined,
): T[] {
  if (isHiddenIndexEmpty(index)) return tracks;
  const visible = tracks.filter(
    (track) => hiddenReason(index, track, serverType) == null,
  );
  return visible.length === tracks.length ? tracks : visible;
}

// Filters a list about to be played and moves the requested start onto what
// survives: the same track when it is visible, otherwise the next visible one
// after it (the one that would have played next), else the last one before it.
export function filterHiddenFromStart<T extends HiddenMatchable>(
  tracks: T[],
  startIndex: number,
  index: HiddenIndex,
  serverType: ServerType | undefined,
): { tracks: T[]; startIndex: number } {
  if (isHiddenIndexEmpty(index)) return { tracks, startIndex };
  const visible: T[] = [];
  let start = -1;
  for (let i = 0; i < tracks.length; i += 1) {
    if (hiddenReason(index, tracks[i], serverType) != null) continue;
    if (start === -1 && i >= startIndex) start = visible.length;
    visible.push(tracks[i]);
  }
  if (visible.length === tracks.length) return { tracks, startIndex };
  return {
    tracks: visible,
    startIndex: start === -1 ? Math.max(0, visible.length - 1) : start,
  };
}
