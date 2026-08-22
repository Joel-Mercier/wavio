import { search3 } from "@/services/backend/searching";
import {
  normalizeLoose,
  similarity,
  stripBracketNoise,
} from "@/services/musicbrainz/match";
import type { Child } from "@/services/openSubsonic/types";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";
import { AbortedError } from "@/utils/rateLimitedQueue";

/**
 * Resolves tracks named by an outside service against the user's own library.
 *
 * Lives at the root of `services/` rather than under `listenBrainz/` because
 * nothing here is ListenBrainz-specific — a MusicBrainz tracklist or a
 * downloader's results resolve exactly the same way.
 *
 * The shape of the problem is set by what the backends can actually do: none of
 * them can *search* by MusicBrainz id. Navidrome/Subsonic index title, album and
 * artist; Jellyfin matches the item name; the local library's FTS5 table indexes
 * title/artist/album/album_artist and keeps `music_brainz_id` as a plain column.
 * So an MBID can only ever *confirm* a candidate that a text search already
 * returned — it can never find one. Hence: search by title, score, and let an
 * MBID hit win outright.
 */

export type ExternalTrack = {
  /** Stable identity for the caller's list; never interpreted here. */
  key: string;
  title: string;
  artist: string;
  /** The lead artist alone, when the credit has several. */
  primaryArtist?: string;
  album?: string;
  durationMs?: number;
  recordingMbid?: string;
};

export type LibraryMatch<T extends ExternalTrack> =
  | { state: "matched"; external: T; track: Child; confidence: number }
  | { state: "missing"; external: T };

/**
 * Scoring constants, exported so tests assert against these numbers rather than
 * their own copies.
 *
 * A deliberate rebalance of RECORDING_WEIGHTS in services/musicbrainz/match.ts
 * (title .3 / artist .2 / duration .28 / searchScore .07 / canonicalRelease .15).
 * Two of those five terms don't exist here — there is no MusicBrainz search score
 * and no release group — so their weight redistributes. Duration also matters
 * *less* than it does there: that scorer compares every MusicBrainz recording of
 * a work, where length separates the studio take from the live one, whereas here
 * the candidates are already title-filtered by the server and the open question
 * is "is this the same artist?".
 */
export const MATCH_WEIGHTS = { title: 0.45, artist: 0.35, duration: 0.2 };
/**
 * Wider than match.ts's 3s: the external duration is a MusicBrainz recording
 * length, not the length of the file the user actually holds, so drift between
 * the two is structural rather than a sign of a different recording.
 */
export const DURATION_TOLERANCE_MS = 5000;
/** Score for a term that cannot be compared, same convention as match.ts. */
export const NEUTRAL = 0.6;
export const ACCEPT = 0.72;
// Gates, so a perfect score on one term can never carry a clearly wrong other.
export const MIN_TITLE = 0.55;
export const MIN_ARTIST = 0.45;

const CANDIDATE_COUNT = 25;
// Matches SONGS_EXIST_CONCURRENCY in services/openSubsonic/browsing.ts — enough
// to keep a 50-track resolve under ~15 waves without tripping rate limits.
const MATCH_CONCURRENCY = 4;
const MAX_CANDIDATES_KEPT = 3;

type Scored = {
  track: Child;
  confidence: number;
  title: number;
  artist: number;
};

/**
 * The text sent to the server.
 *
 * Title only, because that is the one form all three backends honour: Jellyfin's
 * `SearchTerm` matches the item name alone, so `"<artist> <title>"` returns
 * nothing there. And the *raw* title rather than `normalizeLoose`, which strips
 * punctuation — Jellyfin does a substring match, so "don t stop" finds nothing
 * where "Don't Stop" finds the row. normalizeLoose is for scoring only.
 */
function titleQuery(external: ExternalTrack): string {
  const stripped = stripBracketNoise(external.title)
    .replace(/\s+/g, " ")
    .trim();
  return stripped || external.title.trim();
}

/**
 * The rescue query, for backends whose search reads more than the item name.
 * Gated on the caller's `multiFieldSearch` because on Jellyfin this is not
 * merely a weaker query but an empty one — see titleQuery above.
 */
function comboQuery(external: ExternalTrack): string {
  return `${external.primaryArtist || external.artist} ${titleQuery(external)}`.trim();
}

async function searchCandidates(
  query: string,
  musicFolderId?: string,
): Promise<Child[]> {
  if (!query) return [];
  try {
    const response = await search3(query, {
      songCount: CANDIDATE_COUNT,
      albumCount: 0,
      artistCount: 0,
      musicFolderId,
    });
    return response.searchResult3?.song ?? [];
  } catch {
    // One unlucky search must not fail the other forty-nine.
    return [];
  }
}

function durationScore(external: ExternalTrack, candidate: Child): number {
  // Subsonic reports track length in seconds; the external one is milliseconds.
  const candidateMs =
    typeof candidate.duration === "number" && candidate.duration > 0
      ? candidate.duration * 1000
      : undefined;
  if (!external.durationMs || !candidateMs) return NEUTRAL;
  const delta = Math.abs(external.durationMs - candidateMs);
  if (delta <= DURATION_TOLERANCE_MS) return 1;
  return Math.max(0, 1 - delta / external.durationMs);
}

function artistScore(external: ExternalTrack, candidate: Child): number {
  const candidateArtist = candidate.artist ?? candidate.displayAlbumArtist;
  if (!candidateArtist?.trim()) return NEUTRAL;
  // A library tagged with only the lead artist scores badly against a full
  // "A feat. B" credit, and vice versa — take whichever reading fits better.
  return Math.max(
    similarity(candidateArtist, external.artist),
    external.primaryArtist
      ? similarity(candidateArtist, external.primaryArtist)
      : 0,
  );
}

function score(external: ExternalTrack, candidate: Child): Scored {
  const title = similarity(external.title, candidate.title);
  const artist = artistScore(external, candidate);
  const duration = durationScore(external, candidate);
  return {
    track: candidate,
    title,
    artist,
    confidence:
      MATCH_WEIGHTS.title * title +
      MATCH_WEIGHTS.artist * artist +
      MATCH_WEIGHTS.duration * duration,
  };
}

function isAcceptable(scored: Scored): boolean {
  return (
    scored.confidence >= ACCEPT &&
    scored.title >= MIN_TITLE &&
    scored.artist >= MIN_ARTIST
  );
}

/**
 * An MBID hit is not scored — it *is* the answer.
 *
 * Child.musicBrainzId on a song is the recording MBID on every backend that
 * fills it in (Navidrome from mbz_track_id, the local library from its indexed
 * tags, Jellyfin from ProviderIds.MusicBrainzRecording). Backends that leave it
 * empty simply fall through to the fuzzy path.
 */
function mbidHit(external: ExternalTrack, candidate: Child): boolean {
  return (
    !!external.recordingMbid &&
    candidate.musicBrainzId?.toLowerCase() ===
      external.recordingMbid.toLowerCase()
  );
}

function rank(external: ExternalTrack, candidates: Child[]): Scored[] {
  const scored = candidates.map((candidate) =>
    mbidHit(external, candidate)
      ? { track: candidate, confidence: 1, title: 1, artist: 1 }
      : score(external, candidate),
  );
  return scored.sort((a, b) => b.confidence - a.confidence);
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortedError();
}

function dedupeById(candidates: Child[]): Child[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

/**
 * Matches each external track to a library track, preserving input order.
 *
 * Runs in two phases on purpose. Searching and scoring are order-independent and
 * go out concurrently; *accepting* is then done sequentially, so that when two
 * tracks with the same generic title contend for one library row the earlier
 * position wins and the row is never claimed twice.
 *
 * Cancellation is cooperative — `search3` has no AbortSignal path (it goes
 * through folderScopedRequest, which takes no axios config) — so the signal is
 * checked between searches. At most `concurrency` requests are still in flight
 * when an abort lands.
 */
export async function matchTracksToLibrary<T extends ExternalTrack>(
  externals: readonly T[],
  {
    musicFolderId,
    signal,
    concurrency = MATCH_CONCURRENCY,
    multiFieldSearch = true,
  }: {
    musicFolderId?: string;
    signal?: AbortSignal;
    concurrency?: number;
    /**
     * The backend's `multiFieldSearch` capability, passed in rather than read
     * off the auth store so this stays a pure function of its inputs. Defaults
     * to the majority case; only Jellyfin needs to say otherwise.
     */
    multiFieldSearch?: boolean;
  } = {},
): Promise<LibraryMatch<T>[]> {
  if (!externals.length) return [];

  const ranked = await mapWithConcurrency(
    externals,
    concurrency,
    async (external) => {
      assertNotAborted(signal);
      let pool = await searchCandidates(titleQuery(external), musicFolderId);
      let scored = rank(external, pool);

      // Only when the first pass failed: a generic title ("Home", "Alive") whose
      // correct row fell off the result cap is rescued by naming the artist.
      if (multiFieldSearch && (!scored.length || !isAcceptable(scored[0]))) {
        assertNotAborted(signal);
        pool = dedupeById([
          ...pool,
          ...(await searchCandidates(comboQuery(external), musicFolderId)),
        ]);
        scored = rank(external, pool);
      }

      return scored.slice(0, MAX_CANDIDATES_KEPT);
    },
  );

  const taken = new Set<string>();
  return externals.map((external, index) => {
    const candidate = ranked[index].find(
      (scored) => isAcceptable(scored) && !taken.has(scored.track.id),
    );
    if (!candidate) return { state: "missing", external };
    taken.add(candidate.track.id);
    return {
      state: "matched",
      external,
      track: candidate.track,
      confidence: candidate.confidence,
    };
  });
}

/** Re-exported so callers can normalise their own strings the same way. */
export { normalizeLoose, similarity };
