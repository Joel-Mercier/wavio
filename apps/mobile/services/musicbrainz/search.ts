import { musicBrainzRequest } from "@/services/musicbrainz";
import { normalizeLoose } from "@/services/musicbrainz/match";
import type {
  MbRecording,
  MbRecordingSearchResponse,
  MbRelease,
  MbReleaseSearchResponse,
} from "@/services/musicbrainz/types";

const SEARCH_LIMIT = 10;

// Wider than the release search: a popular song has dozens of recordings (live
// takes, edits, remasters) and the studio one isn't reliably in the first ten.
const RECORDING_SEARCH_LIMIT = 25;

// Inside a quoted phrase Lucene only treats a backslash and a quote as syntax —
// escaping anything else inserts a literal backslash and breaks the phrase.
export function escapeLucene(value: string): string {
  return value.replace(/([\\"])/g, "\\$1");
}

// A standalone year left behind by tag noise like "(2011 Remaster)" or "(1994)".
// Stripping "remaster" alone leaves the digits stranded in the phrase, which is
// enough to match nothing at all.
const STRAY_YEAR = /\b(?:19|20)\d{2}\b/g;

// Featuring credits belong to the track, not the release artist, and
// MusicBrainz won't match an artist phrase carrying them.
const FEATURING = /\s+(?:feat|ft|featuring|with)\b.*$/i;

function queryTerm(field: string, value: string): string | null {
  // normalizeLoose strips packaging bracket groups itself, so the query and the
  // similarity scoring that later compares against it agree by construction.
  const cleaned = normalizeLoose(value.replace(FEATURING, ""))
    .replace(STRAY_YEAR, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = cleaned || normalizeLoose(value) || value.trim();
  if (!normalized) return null;
  return `${field}:"${escapeLucene(normalized)}"`;
}

async function runSearch(
  query: string,
  signal?: AbortSignal,
): Promise<MbRelease[]> {
  const data = await musicBrainzRequest<MbReleaseSearchResponse>(
    "/release",
    { query, limit: SEARCH_LIMIT },
    signal,
  );
  return data.releases ?? [];
}

/**
 * Finds candidate MusicBrainz releases for a local album.
 *
 * Track count is deliberately *not* part of the query. It reads like a useful
 * constraint but MusicBrainz applies it as a hard filter — `tracks:99` returns
 * zero rows — so a partial rip, a hidden track or a different edition would
 * silently match nothing. It's scored instead (see trackCountScore), where a
 * mismatch lowers confidence rather than hiding the release.
 *
 * Falls back to an album-only search when the artist-constrained one comes back
 * empty, which recovers albums whose album-artist tag is wrong or carries
 * featuring credits that MusicBrainz won't match.
 */
export async function searchRelease(
  { album, artist }: { album: string; artist?: string | null },
  signal?: AbortSignal,
): Promise<MbRelease[]> {
  const albumTerm = queryTerm("release", album);
  if (!albumTerm) return [];

  const artistTerm = artist ? queryTerm("artist", artist) : null;
  if (artistTerm) {
    const withArtist = await runSearch(
      `${albumTerm} AND ${artistTerm}`,
      signal,
    );
    if (withArtist.length > 0) return withArtist;

    // "Blue Lines - 2012 Mix/Master" and friends: an edition qualifier after a
    // separator. Truncating there generalises better than growing an endless
    // list of qualifier words to strip.
    const shortTerm = queryTerm("release", album.split(/\s+[-–—:]\s+/)[0]);
    if (shortTerm && shortTerm !== albumTerm) {
      const truncated = await runSearch(
        `${shortTerm} AND ${artistTerm}`,
        signal,
      );
      if (truncated.length > 0) return truncated;
    }
  }

  return runSearch(albumTerm, signal);
}

/**
 * Finds candidate recordings for a single track.
 *
 * The fallback for files that never grouped into an album — a loose
 * "Artist - Title.mp3" has no album to search on, so album-level matching can't
 * see it at all. Costs one request per track, so it is only used for albums that
 * album-level matching couldn't resolve.
 */
export async function searchRecording(
  { title, artist }: { title: string; artist?: string | null },
  signal?: AbortSignal,
): Promise<MbRecording[]> {
  const titleTerm = queryTerm("recording", title);
  if (!titleTerm) return [];

  const artistTerm = artist ? queryTerm("artist", artist) : null;
  const base = artistTerm ? `${titleTerm} AND ${artistTerm}` : titleTerm;

  const run = (query: string) =>
    musicBrainzRequest<MbRecordingSearchResponse>(
      "/recording",
      { query, limit: RECORDING_SEARCH_LIMIT },
      signal,
    ).then((data) => data.recordings ?? []);

  // `status:official` is what makes this usable. Without it the results are
  // dominated by bootlegs and live recordings, and the releases attached to them
  // are bootlegs too — so a track gets attributed to a concert recording instead
  // of the album it came from. Measured against the live API, adding it moved
  // "Creep" from no usable album to Pablo Honey, and "Karma Police" to OK
  // Computer. Deliberately *not* combined with `primarytype:album`, which would
  // exclude tracks whose only official release is a single or EP.
  const official = await run(`${base} AND status:official`);
  if (official.length > 0) return official;

  // Nothing official: fall back so a track that only exists on unofficial
  // releases can still have its title and artist corrected.
  return run(base);
}

// One lookup returns the full tracklist with recordings and artist credits,
// which is what keeps album-level matching affordable under the 1 req/s budget.
const LOOKUP_INC = [
  "recordings",
  "artist-credits",
  "release-groups",
  "labels",
  "media",
].join("+");

export async function lookupRelease(
  mbid: string,
  signal?: AbortSignal,
): Promise<MbRelease> {
  return musicBrainzRequest<MbRelease>(
    `/release/${mbid}`,
    { inc: LOOKUP_INC },
    signal,
  );
}
