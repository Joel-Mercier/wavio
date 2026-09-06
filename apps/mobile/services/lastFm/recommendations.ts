import { hasLastFmCredentials } from "@/services/lastFm/config";
import {
  fetchSimilarTracks,
  type LastFmSimilarArtist,
} from "@/services/lastFm/similar";
import { currentLibrarySearchContext } from "@/services/libraryContext";
import { matchTracksToLibrary, normalizeLoose } from "@/services/libraryMatch";
import type { ArtistID3, Child } from "@/services/openSubsonic/types";
import { isLastFmConnected } from "@/stores/lastFm";

/**
 * Last.fm's collaborative filtering, resolved to tracks the user actually owns.
 *
 * Gated on a *connected* account rather than on the API key alone. The read
 * itself is unsigned and would work for anyone, but it means posting the title
 * the user is listening to at a third party — connecting an account is how they
 * say yes to that, and nothing else here would.
 */

/** What identifies the seed to Last.fm. `title` + `artist`, or an mbid. */
export type LastFmSeed = {
  title?: string;
  artist?: string;
  musicBrainzId?: string;
};

// Asked for generously and trimmed by the caller: Last.fm names its whole
// catalogue, and most of it isn't in any given library, so a request for ten
// typically resolves to one or two.
const CANDIDATE_MULTIPLIER = 4;
const MAX_CANDIDATES = 60;

export const canUseLastFmRecommendations = (): boolean =>
  hasLastFmCredentials() && isLastFmConnected();

export async function fetchLastFmSimilarSongs(
  seed: LastFmSeed | undefined,
  { count = 20, signal }: { count?: number; signal?: AbortSignal } = {},
): Promise<Child[]> {
  if (!seed || !canUseLastFmRecommendations()) return [];
  if (!seed.musicBrainzId && !(seed.title && seed.artist)) return [];

  const similar = await fetchSimilarTracks({
    artist: seed.artist,
    track: seed.title,
    mbid: seed.musicBrainzId,
    limit: Math.min(count * CANDIDATE_MULTIPLIER, MAX_CANDIDATES),
    signal,
  });
  if (similar.length === 0) return [];

  const { musicFolderId, multiFieldSearch } = currentLibrarySearchContext();
  const matches = await matchTracksToLibrary(
    similar.map((track, index) => ({
      // Last.fm can name the same recording twice under different mbids, so the
      // position is what keeps the keys distinct.
      key: `${index}`,
      title: track.name,
      artist: track.artist,
      durationMs: track.durationMs,
      recordingMbid: track.mbid,
    })),
    { musicFolderId, multiFieldSearch, signal },
  );

  // Order is Last.fm's, best match first, and matchTracksToLibrary preserves it.
  return matches
    .filter((match) => match.state === "matched")
    .map(
      (match) => (match as Extract<typeof match, { state: "matched" }>).track,
    )
    .slice(0, count);
}

/**
 * The library's own artists, indexed the two ways Last.fm can name one.
 *
 * Name matching leans on normalizeLoose — which drops a leading article and
 * bracketed noise, and so matches "The Beatles" to a library tagged "Beatles".
 */
type LibraryArtistIndex = {
  byName: Map<string, ArtistID3>;
  byMbid: Map<string, ArtistID3>;
};

const indexLibraryArtists = (
  libraryArtists: readonly ArtistID3[],
): LibraryArtistIndex => {
  const byName = new Map<string, ArtistID3>();
  const byMbid = new Map<string, ArtistID3>();
  for (const artist of libraryArtists) {
    const name = normalizeLoose(artist.name ?? "");
    // First wins: the index is alphabetical, so this is stable across renders.
    if (name && !byName.has(name)) byName.set(name, artist);
    const mbid = artist.musicBrainzId?.toLowerCase();
    if (mbid && !byMbid.has(mbid)) byMbid.set(mbid, artist);
  }
  return { byName, byMbid };
};

const lookupLibraryArtist = (
  index: LibraryArtistIndex,
  candidate: { name: string; mbid?: string },
): ArtistID3 | undefined =>
  (candidate.mbid && index.byMbid.get(candidate.mbid.toLowerCase())) ||
  index.byName.get(normalizeLoose(candidate.name));

/**
 * Picks the library's own artists out of a Last.fm similar-artists list.
 *
 * Matched in memory against the artist index the app already holds rather than
 * with one `search3` per name: the index is a single request the artists tab has
 * usually cached anyway, and thirty searches is not a price a home-screen
 * section gets to charge. That does mean the comparison is name-only whenever
 * Last.fm names no mbid — see indexLibraryArtists.
 *
 * Order is Last.fm's, strongest match first.
 */
export function resolveSimilarArtists(
  similar: readonly LastFmSimilarArtist[],
  libraryArtists: readonly ArtistID3[],
  limit: number,
): ArtistID3[] {
  const index = indexLibraryArtists(libraryArtists);

  const picked: ArtistID3[] = [];
  const taken = new Set<string>();
  for (const candidate of similar) {
    if (picked.length >= limit) break;
    const match = lookupLibraryArtist(index, candidate);
    if (!match || taken.has(match.id)) continue;
    taken.add(match.id);
    picked.push(match);
  }
  return picked;
}

/**
 * Narrows a list of Last.fm names to the ones the library actually has.
 *
 * Used to seed "Because you listened to…" from an artist the user owns rather
 * than from whatever tops their Last.fm month. The two are not the same list —
 * Last.fm counts what they played anywhere, including on services whose
 * catalogue this library has never held — and a seed with nothing behind it in
 * the library can only ever produce an empty row.
 *
 * Returns **Last.fm's** spelling, not the library's, because the names go
 * straight back out to `artist.getSimilar`. Order is the caller's.
 */
export function pickLibrarySeeds(
  candidates: readonly { name: string; mbid?: string }[],
  libraryArtists: readonly ArtistID3[],
  limit: number,
): string[] {
  const index = indexLibraryArtists(libraryArtists);

  const seeds: string[] = [];
  const taken = new Set<string>();
  for (const candidate of candidates) {
    if (seeds.length >= limit) break;
    const match = lookupLibraryArtist(index, candidate);
    if (!match || taken.has(match.id)) continue;
    taken.add(match.id);
    seeds.push(candidate.name);
  }
  return seeds;
}
