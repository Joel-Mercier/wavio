import type {
  Child,
  Playlist,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";

export const SMART_REFRESH_MS = 24 * 60 * 60 * 1000;
export const REVERIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_REVERIFY_PER_REFRESH = 5;
export const MAX_FETCH_PER_REFRESH = 20;

export type PlaylistArtistEntry = {
  signature: string;
  fetchedAt: number;
  artists: Record<string, number>;
  rulesHash?: string;
};

export type ListedPlaylist = {
  playlist: Playlist;
  smart: boolean;
  rulesHash?: string;
};

export type RefreshPlan = { fetch: string[]; drop: string[]; more: boolean };

function timestamp(value: unknown): string {
  if (value == null) return "";
  const time =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isNaN(time) ? String(value) : String(time);
}

export function playlistSignature(
  playlist: Pick<Playlist, "changed" | "songCount" | "duration">,
): string {
  return `${timestamp(playlist.changed)}|${playlist.songCount ?? 0}|${playlist.duration ?? 0}`;
}

export function artistTrackCounts(
  entries: Child[] | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const song of entries ?? []) {
    const ids = new Set<string>();
    if (song.artistId) ids.add(song.artistId);
    for (const artist of song.artists ?? []) {
      if (artist.id) ids.add(artist.id);
    }
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function entryFromPlaylist(
  playlist: PlaylistWithSongs,
  {
    signature,
    rulesHash,
    now,
  }: { signature: string; rulesHash?: string; now: number },
): PlaylistArtistEntry {
  return {
    signature,
    fetchedAt: now,
    artists: artistTrackCounts(playlist.entry),
    ...(rulesHash !== undefined ? { rulesHash } : {}),
  };
}

function olderThan(fetchedAt: number, maxAge: number, now: number): boolean {
  return now < fetchedAt || now - fetchedAt >= maxAge;
}

// Membership is only ever derived from what the server lists, never patched by
// the code that edits playlists: a playlist is refetched when its listing
// signature moves, and anything the signature can't see (a track re-tagged to
// another artist, a same-length swap) is caught by the periodic re-verify.
// Smart playlists re-evaluate on every read, which moves their signature each
// time we fetch them, so they go on a clock (plus rule edits) instead.
// Each refresh fetches at most MAX_FETCH_PER_REFRESH, outdated entries first,
// and reports `more` so the caller knows a backlog is left for the next one.
export function planRefresh(
  listed: readonly ListedPlaylist[],
  entries: ReadonlyMap<string, PlaylistArtistEntry>,
  now: number,
  skip: (id: string) => boolean = () => false,
): RefreshPlan {
  const listedIds = new Set(listed.map(({ playlist }) => playlist.id));
  const drop = [...entries.keys()].filter((id) => !listedIds.has(id));
  const outdated: string[] = [];
  const missing: string[] = [];
  const due: { id: string; fetchedAt: number }[] = [];
  const reverify: { id: string; fetchedAt: number }[] = [];
  for (const { playlist, smart, rulesHash } of listed) {
    if (skip(playlist.id)) continue;
    const entry = entries.get(playlist.id);
    if (!entry) {
      missing.push(playlist.id);
    } else if (smart) {
      if (rulesHash !== undefined && entry.rulesHash !== rulesHash) {
        outdated.push(playlist.id);
      } else if (olderThan(entry.fetchedAt, SMART_REFRESH_MS, now)) {
        due.push({ id: playlist.id, fetchedAt: entry.fetchedAt });
      }
    } else if (entry.signature !== playlistSignature(playlist)) {
      outdated.push(playlist.id);
    } else if (olderThan(entry.fetchedAt, REVERIFY_AFTER_MS, now)) {
      reverify.push({ id: playlist.id, fetchedAt: entry.fetchedAt });
    }
  }
  const oldestFirst = (items: { id: string; fetchedAt: number }[]) =>
    items.sort((a, b) => a.fetchedAt - b.fetchedAt).map(({ id }) => id);
  const wanted = [
    ...outdated,
    ...missing,
    ...oldestFirst(due),
    ...oldestFirst(reverify).slice(0, MAX_REVERIFY_PER_REFRESH),
  ];
  return {
    fetch: wanted.slice(0, MAX_FETCH_PER_REFRESH),
    drop,
    more: wanted.length > MAX_FETCH_PER_REFRESH,
  };
}

export function playlistsForArtist(
  artistId: string,
  listing: readonly Playlist[],
  entries: ReadonlyMap<string, PlaylistArtistEntry>,
): Playlist[] {
  const matches: { playlist: Playlist; count: number }[] = [];
  for (const playlist of listing) {
    const count = entries.get(playlist.id)?.artists[artistId] ?? 0;
    if (count > 0) matches.push({ playlist, count });
  }
  matches.sort(
    (a, b) =>
      b.count - a.count ||
      (a.playlist.name ?? "").localeCompare(b.playlist.name ?? "", undefined, {
        sensitivity: "base",
      }),
  );
  return matches.map(({ playlist }) => playlist);
}

export function hashRules(rules: unknown): string {
  const text = JSON.stringify(rules ?? null);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
