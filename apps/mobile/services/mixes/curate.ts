import { normalize, normalizeLoose } from "@/services/musicbrainz/match";
import type { Child } from "@/services/openSubsonic/types";
import { shuffle } from "@/utils/shuffle";

// Intros, skits and interludes: a mix is a run of songs, and a 20-second track
// between two of them reads as a glitch rather than a pick.
const MIN_DURATION_SECONDS = 60;

export type CurateMixOptions = {
  target: number;
  maxPerArtist: number;
  maxPerAlbum: number;
  /** No artist is repeated within this many tracks unless nothing else fits. */
  minSpacing: number;
  /** Per-artist cap overrides, keyed by mixArtistKey. */
  artistCaps?: ReadonlyMap<string, number>;
};

// No word or article stripping: normalizeLoose's edition qualifiers are real
// artist names ("Mono", "Deluxe"), and "The Band" is not "Band".
function artistNameKey(name: string): string {
  return normalize(name) || name.trim().toLowerCase();
}

// Drops edition noise so a reissue still counts as the same song or album, unless
// that leaves nothing — a title that is only "Mono" must still key on itself.
function titleKey(value: string): string {
  return normalizeLoose(value) || normalize(value);
}

// The track's own artist, never `artistId`: that is the album artist, so every
// track off a compilation would count against one "Various Artists" cap.
export function mixArtistKey(track: Child): string {
  return (
    track.artists?.[0]?.id ??
    `name:${artistNameKey(track.artist ?? "") || track.id}`
  );
}

// Both keys an artist's tracks can land under: by id when the backend credits
// one, by name when it doesn't.
export function mixArtistKeys(artist: { id: string; name: string }): string[] {
  const name = artistNameKey(artist.name);
  return name ? [artist.id, `name:${name}`] : [artist.id];
}

function mixAlbumKey(track: Child): string {
  return track.albumId ?? `name:${titleKey(track.album ?? "") || track.id}`;
}

// The same recording turns up on the album, a best-of and a deluxe reissue, each
// under its own id — the title and artist are what make them one song.
function songKey(track: Child): string | null {
  const title = titleKey(track.title ?? "");
  return title ? `${mixArtistKey(track)}|${title}` : null;
}

function isTooShort(track: Child): boolean {
  return (
    typeof track.duration === "number" &&
    track.duration > 0 &&
    track.duration < MIN_DURATION_SECONDS
  );
}

function dedupe(tracks: readonly Child[]): Child[] {
  const seenIds = new Set<string>();
  const seenSongs = new Set<string>();
  const out: Child[] = [];
  for (const track of tracks) {
    if (seenIds.has(track.id)) continue;
    seenIds.add(track.id);
    const key = songKey(track);
    if (key) {
      if (seenSongs.has(key)) continue;
      seenSongs.add(key);
    }
    out.push(track);
  }
  return out;
}

function groupByArtist(tracks: readonly Child[]): Map<string, Child[]> {
  const groups = new Map<string, Child[]>();
  for (const track of tracks) {
    const key = mixArtistKey(track);
    const group = groups.get(key);
    if (group) group.push(track);
    else groups.set(key, [track]);
  }
  return groups;
}

// Round-robin across artists, so the mix goes wide before it goes deep: with a
// first-come pick, whichever artist the pool happens to hold most of fills its
// cap before a quieter one gets a single track in.
function select(
  tracks: readonly Child[],
  options: CurateMixOptions,
  rand: () => number,
): Child[] {
  const groups = groupByArtist(tracks);
  const artists = shuffle([...groups.keys()], rand);
  const capOf = (artist: string) =>
    options.artistCaps?.get(artist) ?? options.maxPerArtist;
  const albumCounts = new Map<string, number>();
  const taken = new Map<string, number>();
  const picked: Child[] = [];

  let progressed = true;
  while (picked.length < options.target && progressed) {
    progressed = false;
    for (const artist of artists) {
      if (picked.length >= options.target) break;
      if ((taken.get(artist) ?? 0) >= capOf(artist)) continue;
      const group = groups.get(artist) ?? [];
      const index = group.findIndex(
        (track) =>
          (albumCounts.get(mixAlbumKey(track)) ?? 0) < options.maxPerAlbum,
      );
      if (index === -1) continue;
      const [track] = group.splice(index, 1);
      const album = mixAlbumKey(track);
      albumCounts.set(album, (albumCounts.get(album) ?? 0) + 1);
      taken.set(artist, (taken.get(artist) ?? 0) + 1);
      picked.push(track);
      progressed = true;
    }
  }
  return picked;
}

// Always plays the artist with the most tracks left among those not heard in the
// last `minSpacing` picks. Taking the heaviest first is what keeps a large share
// (the seed artist's) spread evenly instead of piling up at the end once every
// lighter artist has run out.
function order(
  tracks: readonly Child[],
  minSpacing: number,
  rand: () => number,
): Child[] {
  const groups = groupByArtist(tracks);
  const recent: string[] = [];
  const out: Child[] = [];

  while (out.length < tracks.length) {
    let best: string | null = null;
    let bestScore = -1;
    let fallback: string | null = null;
    let fallbackScore = -1;
    for (const [artist, group] of groups) {
      if (group.length === 0) continue;
      // The random part stays below 1, so it only ever breaks ties.
      const score = group.length + rand() * 0.99;
      if (score > fallbackScore) {
        fallback = artist;
        fallbackScore = score;
      }
      if (recent.includes(artist)) continue;
      if (score > bestScore) {
        best = artist;
        bestScore = score;
      }
    }
    const artist = best ?? fallback;
    if (artist === null) break;
    const track = groups.get(artist)?.shift();
    if (!track) break;
    out.push(track);
    recent.push(artist);
    if (recent.length > minSpacing) recent.shift();
  }
  return out;
}

/**
 * Turns a pool of candidate tracks into a mix: no repeats, no artist or album
 * taking over, the same artist kept apart. Returns fewer than `target` rather
 * than padding when the pool can't fill it within the caps.
 */
export function curateMix(
  candidates: readonly Child[],
  options: CurateMixOptions,
  rand: () => number,
): Child[] {
  const pool = dedupe(
    shuffle(
      candidates.filter((track) => !isTooShort(track)),
      rand,
    ),
  );
  return order(select(pool, options, rand), options.minSpacing, rand);
}

/**
 * A cap that loosens when the pool has few artists, so a niche genre still
 * yields a mix rather than six tracks — but never so far that one artist
 * dominates it.
 */
export function adaptiveArtistCap(
  tracks: readonly Child[],
  target: number,
  { floor, ceiling }: { floor: number; ceiling: number },
): number {
  const artists = new Set(tracks.map(mixArtistKey)).size;
  if (artists === 0) return floor;
  return Math.min(ceiling, Math.max(floor, Math.ceil(target / artists)));
}
