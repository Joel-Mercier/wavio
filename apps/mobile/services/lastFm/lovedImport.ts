import { star } from "@/services/backend/mediaAnnotation";
import {
  fetchLovedTracks,
  LOVED_TRACKS_PAGE_SIZE,
} from "@/services/lastFm/user";
import {
  type ExternalTrack,
  matchTracksToLibrary,
} from "@/services/libraryMatch";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";
import { AbortedError } from "@/utils/rateLimitedQueue";

/**
 * A one-shot import of the loved tracks on last.fm into the library's own
 * favourites.
 *
 * Deliberately one-shot rather than a continuous two-way sync: reconciling two
 * sets that both change needs conflict resolution and a tombstone for every
 * un-love, and neither side records when a track stopped being loved. A button
 * the user presses is honest about being a snapshot.
 *
 * Note the direction — this only ever *adds* favourites. A track loved on
 * last.fm but not in the library is reported as missing, and a library
 * favourite that isn't loved on last.fm is left completely alone.
 */

// Newest loves first, so a truncated import is the useful half rather than an
// arbitrary one. Each track costs one or two library searches, so an account
// with a decade of loves would otherwise fire several thousand requests at a
// server the user is also listening on.
export const MAX_IMPORTED_LOVES = 1000;

// Matches libraryMatch's own default: enough to keep the fan-out moving without
// tripping server-side rate limits.
const STAR_CONCURRENCY = 4;

export type LovedImportPhase = "fetching" | "matching" | "starring";

export type LovedImportProgress = {
  phase: LovedImportPhase;
  done: number;
  /** 0 while the total is still unknown (the first page hasn't answered). */
  total: number;
};

export type LovedImportResult = {
  /** Loved tracks actually considered, after the cap. */
  fetched: number;
  /** How many resolved to a library track. */
  matched: number;
  /** How many were newly favourited (already-favourited matches don't count). */
  starred: number;
  /** Matches whose star request failed. */
  failed: number;
  /** True when the account holds more loves than MAX_IMPORTED_LOVES. */
  truncated: boolean;
};

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AbortedError();
};

/**
 * Pages through the account's loved tracks up to the cap.
 *
 * Sequential on purpose: `totalPages` is only known once the first page has
 * answered, and Last.fm rate-limits per key across every user of the app.
 */
const fetchAllLovedTracks = async ({
  userName,
  signal,
  onProgress,
}: {
  userName: string;
  signal?: AbortSignal;
  onProgress?: (progress: LovedImportProgress) => void;
}) => {
  const collected: Awaited<ReturnType<typeof fetchLovedTracks>>["items"] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;

  do {
    assertNotAborted(signal);
    const result = await fetchLovedTracks({
      userName,
      page,
      limit: LOVED_TRACKS_PAGE_SIZE,
      signal,
    });
    totalPages = result.totalPages;
    total = result.total;
    collected.push(...result.items);
    onProgress?.({
      phase: "fetching",
      done: collected.length,
      total: Math.min(total, MAX_IMPORTED_LOVES),
    });
    page++;
  } while (page <= totalPages && collected.length < MAX_IMPORTED_LOVES);

  return {
    tracks: collected.slice(0, MAX_IMPORTED_LOVES),
    truncated: total > MAX_IMPORTED_LOVES,
  };
};

export async function importLovedTracks({
  userName,
  musicFolderId,
  multiFieldSearch,
  signal,
  onProgress,
}: {
  userName: string;
  musicFolderId?: string;
  multiFieldSearch?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LovedImportProgress) => void;
}): Promise<LovedImportResult> {
  const { tracks, truncated } = await fetchAllLovedTracks({
    userName,
    signal,
    onProgress,
  });

  if (tracks.length === 0) {
    return { fetched: 0, matched: 0, starred: 0, failed: 0, truncated };
  }

  onProgress?.({ phase: "matching", done: 0, total: tracks.length });
  const externals: ExternalTrack[] = tracks.map((track, index) => ({
    // The name/artist pair isn't unique — an account can love two different
    // recordings of the same song — so the position is what makes the key
    // stable.
    key: `${index}`,
    title: track.name,
    artist: track.artist,
    recordingMbid: track.mbid,
  }));
  const matches = await matchTracksToLibrary(externals, {
    musicFolderId,
    signal,
    multiFieldSearch,
  });

  // Already-favourited matches are skipped rather than re-sent: the request
  // would succeed and change nothing, and on a large import that is most of it.
  const toStar = matches
    .filter((match) => match.state === "matched" && !match.track.starred)
    .map(
      (match) => (match as Extract<typeof match, { state: "matched" }>).track,
    );

  let done = 0;
  let failed = 0;
  onProgress?.({ phase: "starring", done: 0, total: toStar.length });
  await mapWithConcurrency(toStar, STAR_CONCURRENCY, async (track) => {
    assertNotAborted(signal);
    try {
      // The backend service rather than useStar: these tracks are *already*
      // loved on last.fm, and going through the hook would queue a love for
      // every one of them straight back at the account we just read.
      await star({ id: track.id });
    } catch {
      // One rejected star must not abort the other nine hundred.
      failed++;
    }
    done++;
    onProgress?.({ phase: "starring", done, total: toStar.length });
  });

  return {
    fetched: tracks.length,
    matched: matches.filter((match) => match.state === "matched").length,
    starred: toStar.length - failed,
    failed,
    truncated,
  };
}
