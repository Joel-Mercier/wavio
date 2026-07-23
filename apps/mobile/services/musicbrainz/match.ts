import type {
  LocalAlbumCandidate,
  LocalTrackCandidate,
  MbRecording,
  MbRecordingRelease,
  MbRelease,
  MbTrack,
} from "@/services/musicbrainz/types";

// A track whose length lands within this of the local file is treated as the
// same recording. Encoder padding and inconsistent gapless trimming routinely
// shift durations by a second or two, so an exact match is too strict.
const DURATION_TOLERANCE_MS = 3000;

// Weights sum to 1. Title and track count carry the most signal: a release with
// the right name and the right number of tracks is almost always correct, while
// MusicBrainz's own search score is noisy enough to be a tiebreaker only.
const WEIGHTS = {
  title: 0.3,
  artist: 0.2,
  trackCount: 0.2,
  duration: 0.2,
  searchScore: 0.1,
};

// Applied when a field can't be compared (no durations extracted, no album
// artist tagged) so an unknowable field neither rewards nor punishes a match.
const NEUTRAL = 0.6;

const canNormalize = typeof String.prototype.normalize === "function";

// Combining diacritical marks, written as escapes so the source stays readable
// (a literal range here is invisible in most editors).
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Casefold, strip diacritics and punctuation, collapse whitespace. */
export function normalize(value: string): string {
  const deaccented = canNormalize
    ? value.normalize("NFD").replace(COMBINING_MARKS, "")
    : value;
  return deaccented
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that mark a bracketed group as packaging noise rather than part of the
// title — the signature of files ripped from video sites, e.g.
// "Vidage (Official Audio Release)" or "Human (ft. Echoes) [Lyric Visualiser]".
const BRACKET_NOISE =
  /\b(official|audio|video|lyrics?|visuali[sz]er|hd|4k|mv|premiere|teaser|trailer|full album|free download|out now|explicit|remaster(ed)?)\b/i;

const BRACKET_FEATURING = /\b(feat|ft|featuring)\b/i;

const BRACKET_GROUP = /[([{][^)\]}]*[)\]}]/g;

/**
 * Drops bracketed groups that are packaging noise, keeping ones that identify
 * the recording.
 *
 * Whole-group removal rather than word removal, and only for groups that
 * actually look like noise — so "(Official Audio Release)" and
 * "[Lyric Visualiser]" go, while "(Acoustic)", "(Live)" and "(Radio Edit)" stay,
 * because those genuinely select a different recording.
 */
export function stripBracketNoise(value: string): string {
  return value.replace(BRACKET_GROUP, (group) =>
    BRACKET_NOISE.test(group) || BRACKET_FEATURING.test(group) ? " " : group,
  );
}

/**
 * Normalize, then drop the noise that legitimately differs between a local file
 * and a MusicBrainz release without meaning they're different works — packaging
 * bracket groups, a leading article, and the edition/remaster qualifiers tags
 * love to carry.
 *
 * This is deliberately the *same* function that builds search queries
 * (services/musicbrainz/search.ts) and that scores results. Cleaning only the
 * query left the scorer comparing a raw "Vidage (Official Audio Release)"
 * against MusicBrainz's "Vidage" — 0.21 title similarity on a correct match, low
 * enough to drop it below the acceptance floor.
 */
export function normalizeLoose(value: string): string {
  return normalize(stripBracketNoise(value))
    .replace(
      /\b(remastere?d?|deluxe|expanded|special|anniversary|edition|version|bonus|disc|explicit|mono|stereo)\b/g,
      " ",
    )
    .replace(/^(the|a|an|le|la|les|el|los|die|der|das)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0 (unrelated) to 1 (identical) after loose normalization. */
export function similarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const left = normalizeLoose(a);
  const right = normalizeLoose(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
}

export function releaseArtistName(release: MbRelease): string | null {
  const credits = release["artist-credit"];
  if (!credits?.length) return null;
  return credits
    .map((c) => `${c.name ?? c.artist.name}${c.joinphrase ?? ""}`)
    .join("")
    .trim();
}

/** Flatten every medium's tracklist into one disc-then-position ordered list. */
export function flattenReleaseTracks(release: MbRelease): MbTrack[] {
  const media = release.media ?? [];
  return media
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((medium) =>
      (medium.tracks ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((track) => ({ ...track, discNumber: medium.position ?? 1 })),
    );
}

function sortLocalTracks(tracks: LocalTrackCandidate[]): LocalTrackCandidate[] {
  return tracks
    .slice()
    .sort(
      (a, b) =>
        (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
        (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
    );
}

export type TrackMatch = {
  trackId: string;
  mbTrack: MbTrack | null;
  titleSimilarity: number;
  durationDeltaMs: number | null;
};

/**
 * Pairs local tracks to MusicBrainz tracks positionally, which is correct
 * whenever the tracklists genuinely correspond. Positional order is only
 * trusted if it agrees with the titles: when it doesn't — untagged track
 * numbers, a reissue with a different running order — fall back to greedy
 * best-title matching so each local track still finds its counterpart.
 */
export function alignTracks(
  localTracks: LocalTrackCandidate[],
  mbTracks: MbTrack[],
): TrackMatch[] {
  const ordered = sortLocalTracks(localTracks);

  const positional = ordered.map((local, index) => {
    const mbTrack = mbTracks[index] ?? null;
    return buildTrackMatch(local, mbTrack);
  });

  const positionalScore = averageTitleSimilarity(positional);
  if (positionalScore >= 0.8) return positional;

  const remaining = mbTracks.slice();
  const greedy = ordered.map((local) => {
    let bestIndex = -1;
    let bestScore = 0;
    remaining.forEach((candidate, index) => {
      const score = similarity(local.title, candidate.title);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < 0.5) return buildTrackMatch(local, null);
    const [mbTrack] = remaining.splice(bestIndex, 1);
    return buildTrackMatch(local, mbTrack);
  });

  return averageTitleSimilarity(greedy) > positionalScore ? greedy : positional;
}

function buildTrackMatch(
  local: LocalTrackCandidate,
  mbTrack: MbTrack | null,
): TrackMatch {
  const mbLength = mbTrack?.length ?? mbTrack?.recording?.length ?? null;
  return {
    trackId: local.trackId,
    mbTrack,
    titleSimilarity: mbTrack ? similarity(local.title, mbTrack.title) : 0,
    durationDeltaMs:
      local.durationMs != null && mbLength != null
        ? Math.abs(local.durationMs - mbLength)
        : null,
  };
}

function averageTitleSimilarity(matches: TrackMatch[]): number {
  if (matches.length === 0) return 0;
  const total = matches.reduce((sum, m) => sum + m.titleSimilarity, 0);
  return total / matches.length;
}

export type ScoreBreakdown = {
  title: number;
  artist: number;
  trackCount: number;
  duration: number;
  searchScore: number;
};

export type ReleaseMatch = {
  release: MbRelease;
  confidence: number;
  breakdown: ScoreBreakdown;
  tracks: TrackMatch[];
};

export function scoreRelease(
  local: LocalAlbumCandidate,
  release: MbRelease,
): ReleaseMatch {
  const mbTracks = flattenReleaseTracks(release);
  const tracks = alignTracks(local.tracks, mbTracks);

  const title = similarity(local.album, release.title);
  const artist = local.albumArtist
    ? similarity(local.albumArtist, releaseArtistName(release))
    : NEUTRAL;

  // Search results carry `track-count` without a tracklist; lookups carry the
  // tracklist. Prefer whichever is present so scoring works at both stages.
  const mbCount = mbTracks.length || (release["track-count"] ?? 0);
  const trackCount = mbCount === 0 ? NEUTRAL : trackCountScore(local, mbCount);

  const comparable = tracks.filter((t) => t.durationDeltaMs != null);
  const duration =
    comparable.length === 0
      ? NEUTRAL
      : comparable.filter(
          (t) => (t.durationDeltaMs as number) <= DURATION_TOLERANCE_MS,
        ).length / comparable.length;

  const searchScore =
    release.score != null
      ? Math.min(1, Math.max(0, release.score / 100))
      : NEUTRAL;

  const breakdown: ScoreBreakdown = {
    title,
    artist,
    trackCount,
    duration,
    searchScore,
  };

  const confidence =
    title * WEIGHTS.title +
    artist * WEIGHTS.artist +
    trackCount * WEIGHTS.trackCount +
    duration * WEIGHTS.duration +
    searchScore * WEIGHTS.searchScore;

  return { release, confidence, breakdown, tracks };
}

function trackCountScore(local: LocalAlbumCandidate, mbCount: number): number {
  const localCount = local.tracks.length;
  if (localCount === mbCount) return 1;
  // A partial rip or a reissue with bonus tracks is still very likely the right
  // release, so degrade with the size of the gap instead of rejecting outright.
  const gap = Math.abs(localCount - mbCount);
  return Math.max(0, 1 - gap / Math.max(localCount, mbCount));
}

export function rankReleases(
  local: LocalAlbumCandidate,
  releases: MbRelease[],
): ReleaseMatch[] {
  return releases
    .map((release) => scoreRelease(local, release))
    .sort((a, b) => b.confidence - a.confidence);
}

// --- recording-level matching (loose tracks) --------------------------------

// Duration carries most of the signal when matching a single recording: a title
// and artist search returns dozens of live takes, remixes and edits that differ
// from the studio version mainly in length.
const RECORDING_WEIGHTS = {
  title: 0.3,
  artist: 0.2,
  duration: 0.28,
  searchScore: 0.07,
  // Having an official studio release attached is itself strong evidence this is
  // the canonical recording rather than a live take or an edit, and it is what
  // makes the album attribution possible at all.
  canonicalRelease: 0.15,
};

// Secondary release-group types that mark a release as something other than the
// canonical studio album a loose track most likely came from.
const NON_CANONICAL_TYPES = new Set([
  "live",
  "compilation",
  "remix",
  "dj-mix",
  "demo",
  "mixtape/street",
  "bootleg",
  "interview",
  "spokenword",
  "soundtrack",
]);

function isCanonicalRelease(release: MbRecordingRelease): boolean {
  const group = release["release-group"];
  if (!group) return false;
  if ((group["primary-type"] ?? "").toLowerCase() !== "album") return false;
  if (
    (group["secondary-types"] ?? []).some((t) =>
      NON_CANONICAL_TYPES.has(t.toLowerCase()),
    )
  ) {
    return false;
  }
  // Bootlegs carry the studio release-group type but are marked here.
  if ((release.status ?? "").toLowerCase() !== "official") return false;
  // A "Various Artists" credit means a compilation, whatever its type says.
  return !(release["artist-credit"] ?? []).some(
    (c) => (c.artist?.name ?? "").toLowerCase() === "various artists",
  );
}

/**
 * Picks which release to attribute a loose recording to, or null.
 *
 * A recording search returns every release the recording ever appeared on, and
 * those are routinely bootlegs, live albums and compilations. There is
 * deliberately **no fallback to "the earliest release"**: attributing a track to
 * a bootleg concert recording is worse than leaving its album alone, and the
 * title/artist corrections are valuable on their own. Verified against the live
 * API — the fallback was what produced attributions like "Creep" →
 * "Towering Above the Rest".
 */
export function pickCanonicalRelease(
  recording: MbRecording,
): MbRecordingRelease | null {
  const canonical = (recording.releases ?? [])
    .filter(isCanonicalRelease)
    // Earliest official studio release: the original album rather than a later
    // reissue.
    .sort((a, b) => ((a.date ?? "9999") < (b.date ?? "9999") ? -1 : 1));
  return canonical[0] ?? null;
}

export type RecordingMatch = {
  recording: MbRecording;
  release: MbRecordingRelease | null;
  confidence: number;
  breakdown: {
    title: number;
    artist: number;
    duration: number;
    canonical: number;
  };
};

export function scoreRecording(
  local: LocalTrackCandidate,
  recording: MbRecording,
): RecordingMatch {
  const title = similarity(local.title, recording.title);
  const artist = local.artist
    ? similarity(
        local.artist,
        (recording["artist-credit"] ?? [])
          .map((c) => c.name ?? c.artist.name)
          .join(" "),
      )
    : NEUTRAL;

  const mbLength = recording.length ?? null;
  const duration =
    local.durationMs == null || mbLength == null
      ? NEUTRAL
      : Math.abs(local.durationMs - mbLength) <= DURATION_TOLERANCE_MS
        ? 1
        : // Degrade smoothly instead of cliff-edging, so a 4s drift still beats
          // a 40s one when nothing matches exactly.
          Math.max(
            0,
            1 - Math.abs(local.durationMs - mbLength) / (mbLength || 1),
          );

  const searchScore =
    recording.score != null
      ? Math.min(1, Math.max(0, recording.score / 100))
      : NEUTRAL;

  const release = pickCanonicalRelease(recording);
  const canonical = release ? 1 : 0;

  const confidence =
    title * RECORDING_WEIGHTS.title +
    artist * RECORDING_WEIGHTS.artist +
    duration * RECORDING_WEIGHTS.duration +
    searchScore * RECORDING_WEIGHTS.searchScore +
    canonical * RECORDING_WEIGHTS.canonicalRelease;

  return {
    recording,
    release,
    confidence,
    breakdown: { title, artist, duration, canonical },
  };
}

export function rankRecordings(
  local: LocalTrackCandidate,
  recordings: MbRecording[],
): RecordingMatch[] {
  return recordings
    .map((recording) => scoreRecording(local, recording))
    .sort((a, b) => b.confidence - a.confidence);
}
