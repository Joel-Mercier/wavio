import { getNoBackupStorage } from "@/config/storage";
import type { Playlist } from "@/services/openSubsonic/types";
import type { PlaylistArtistEntry } from "@/services/playlistArtistIndex/plan";

// A cache rebuilt from the server, so it stays out of both backups. One key per
// playlist keeps a refetch from re-serialising every other playlist's artists.
const STORAGE_ID = "playlistArtistIndex";
const LISTING = "listing";
const ENTRY = "entry:";

const storage = () => getNoBackupStorage(STORAGE_ID);
const entryPrefix = (scope: string) => `${scope}:${ENTRY}`;

const listings = new Map<string, Playlist[]>();
const entryMaps = new Map<string, Map<string, PlaylistArtistEntry>>();
const generations = new Map<string, number>();

function parse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Bumped by every forget, so refresh state and reads begun before it can tell
// they are working on a scope that no longer exists.
export function scopeGeneration(scope: string): number {
  let generation = generations.get(scope);
  if (generation === undefined) {
    generation = 0;
    generations.set(scope, generation);
  }
  return generation;
}

export function isLoaded(scope: string): boolean {
  return listings.has(scope) && entryMaps.has(scope);
}

export function readListing(scope: string): Playlist[] {
  let listing = listings.get(scope);
  if (!listing) {
    listing =
      parse<Playlist[]>(storage().getString(`${scope}:${LISTING}`)) ?? [];
    listings.set(scope, listing);
  }
  return listing;
}

export function writeListing(scope: string, listing: Playlist[]): void {
  listings.set(scope, listing);
  storage().set(`${scope}:${LISTING}`, JSON.stringify(listing));
}

export function readEntries(
  scope: string,
): ReadonlyMap<string, PlaylistArtistEntry> {
  let entries = entryMaps.get(scope);
  if (!entries) {
    entries = new Map();
    const prefix = entryPrefix(scope);
    const store = storage();
    for (const key of store.getAllKeys()) {
      if (!key.startsWith(prefix)) continue;
      const entry = parse<PlaylistArtistEntry>(store.getString(key));
      if (entry) entries.set(key.slice(prefix.length), entry);
    }
    entryMaps.set(scope, entries);
  }
  return entries;
}

export function writeEntry(
  scope: string,
  playlistId: string,
  entry: PlaylistArtistEntry,
): void {
  (readEntries(scope) as Map<string, PlaylistArtistEntry>).set(
    playlistId,
    entry,
  );
  storage().set(`${entryPrefix(scope)}${playlistId}`, JSON.stringify(entry));
}

export function deleteEntry(scope: string, playlistId: string): void {
  (readEntries(scope) as Map<string, PlaylistArtistEntry>).delete(playlistId);
  storage().remove(`${entryPrefix(scope)}${playlistId}`);
}

// Scopes never contain ":" (config/authScope.ts), so the text before the first
// one is always the scope a key belongs to.
export function forgetScopes(matches: (scope: string) => boolean): void {
  const store = storage();
  for (const key of store.getAllKeys()) {
    const scope = key.slice(0, key.indexOf(":"));
    if (matches(scope)) store.remove(key);
  }
  for (const scope of [...listings.keys()]) {
    if (matches(scope)) listings.delete(scope);
  }
  for (const scope of [...entryMaps.keys()]) {
    if (matches(scope)) entryMaps.delete(scope);
  }
  for (const [scope, generation] of generations) {
    if (matches(scope)) generations.set(scope, generation + 1);
  }
}

export function __resetPlaylistArtistIndexMemory(): void {
  listings.clear();
  entryMaps.clear();
  generations.clear();
}
