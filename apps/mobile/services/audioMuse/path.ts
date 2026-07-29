import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMusePathResponse,
  AudioMuseTrack,
} from "@/services/audioMuse/types";

// A gradual journey through the library: AudioMuse walks its vector index from
// one endpoint to the other, picking the track nearest each step's centroid, so
// consecutive songs stay close while the two ends can be far apart. Served by
// the core path blueprint, which every deployment registers unconditionally —
// what it needs is an analysed library, not an opt-in feature.
export const PATH_MIN_LENGTH = 10;
export const PATH_MAX_LENGTH = 200;
export const PATH_DEFAULT_LENGTH = 25;

// The five moods the path endpoint accepts — VALID_MOODS in its app_path.py, a
// hardcoded set it rejects anything outside of with a 400. Narrower than both
// the deployment's MOOD_LABELS (a 50-entry genre vocabulary the clustering uses)
// and the mood_centroids catalogue, which also carries "party" — having a
// centroid is not enough for the path endpoint to route to it.
export const PATH_MOODS = [
  "happy",
  "sad",
  "aggressive",
  "relaxed",
  "danceable",
] as const;

export type PathMood = (typeof PATH_MOODS)[number];

export const PATH_MIN_MOOD_PCT = 10;
export const PATH_MAX_MOOD_PCT = 100;
export const PATH_DEFAULT_MOOD_PCT = 100;
export const PATH_MOOD_PCT_STEP = 10;

// How many tracks the picker asks for per query. AudioMuse caps the window at
// 500; a shorter list keeps the sheet responsive while the user is still typing.
export const PATH_SEARCH_LIMIT = 30;

// The centroid walk runs a vector query per step and, with a fixed size, a
// backfill pass on top — well past the instance-wide 15s reachability budget.
const PATH_TIMEOUT_MS = 120_000;

/**
 * One end of a path. A song is the usual case; a mood or an anchor is resolved
 * server-side to the real track nearest that point, which is why only *one* end
 * may be either — the resolution needs the other end as its reference.
 */
export type PathEndpoint =
  | { kind: "song"; itemId: string; title?: string; author?: string }
  | { kind: "mood"; mood: PathMood }
  | { kind: "anchor"; id: number; name: string };

export interface SongPathOptions {
  start: PathEndpoint;
  end: PathEndpoint;
  /** Total tracks including both endpoints, despite the API calling it steps. */
  length: number;
  /** Backfill to exactly `length` rather than stopping at the last good match. */
  fixSize: boolean;
  /** Walk the merged lyrics+audio index instead of the audio one. */
  lyrics: boolean;
  /** How far a mood/anchor end travels from the other end, 10-100. */
  moodPct: number;
  signal?: AbortSignal;
}

export function clampPathLength(length: number): number {
  if (!Number.isFinite(length)) return PATH_DEFAULT_LENGTH;
  return Math.min(
    PATH_MAX_LENGTH,
    Math.max(PATH_MIN_LENGTH, Math.round(length)),
  );
}

export function clampMoodPct(pct: number): number {
  if (!Number.isFinite(pct)) return PATH_DEFAULT_MOOD_PCT;
  return Math.min(
    PATH_MAX_MOOD_PCT,
    Math.max(PATH_MIN_MOOD_PCT, Math.round(pct)),
  );
}

/** Whether an endpoint is resolved server-side rather than being a real track. */
export function isResolvedEndpoint(endpoint: PathEndpoint | null): boolean {
  return !!endpoint && endpoint.kind !== "song";
}

// The endpoints ride as three separate parameter families rather than one, so
// each end contributes only the one it actually is.
function endpointParams(
  endpoint: PathEndpoint,
  side: "start" | "end",
): Record<string, string> {
  switch (endpoint.kind) {
    case "song":
      return { [`${side}_song_id`]: endpoint.itemId };
    case "mood":
      return { [`${side}_mood`]: endpoint.mood };
    case "anchor":
      return { [`${side}_anchor`]: String(endpoint.id) };
  }
}

/**
 * The tracks leading from one endpoint to the other, in playing order.
 *
 * Unlike the similarity endpoints, a 404 here is a refusal with a reason the
 * user can act on — the lyrics index isn't built, a chosen track isn't in it, no
 * path fits within the requested length — so every error is rethrown for the
 * caller to relay via audioMuseErrorMessage rather than flattened to an empty
 * list.
 */
export async function findSongPath({
  start,
  end,
  length,
  fixSize,
  lyrics,
  moodPct,
  signal,
}: SongPathOptions): Promise<AudioMuseTrack[]> {
  const rsp = await audioMuseRequest<AudioMusePathResponse>("/api/find_path", {
    params: {
      ...endpointParams(start, "start"),
      ...endpointParams(end, "end"),
      max_steps: clampPathLength(length),
      // Every one of these is sent unconditionally: omitting one hands back the
      // deployment's own default, so the toggle would silently do nothing on
      // instances configured differently from ours.
      path_fix_size: String(fixSize),
      path_space: lyrics ? "lyrics" : "audio",
      mood_pct: clampMoodPct(moodPct),
    },
    timeout: PATH_TIMEOUT_MS,
    notFoundIsExpected: true,
    signal,
  });

  return (rsp?.path ?? []).filter((track) => !!track.item_id);
}

/**
 * Autocomplete over AudioMuse's own catalogue, matching a title, artist *or*
 * album name from one field. Searching here rather than through the active
 * backend is what guarantees the picked track has been analysed — an id the
 * music server knows but AudioMuse doesn't can only fail at path time.
 */
export async function searchPathTracks(
  query: string,
  {
    lyrics = false,
    limit = PATH_SEARCH_LIMIT,
    signal,
  }: { lyrics?: boolean; limit?: number; signal?: AbortSignal } = {},
): Promise<AudioMuseTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rsp = await audioMuseRequest<AudioMuseTrack[]>("/api/search_tracks", {
    params: {
      search_query: trimmed,
      start: 0,
      end: limit,
      // Restricts the catalogue to tracks carrying both lyrics and audio
      // analysis, so the lyrics path can't be handed an endpoint it will refuse.
      index: lyrics ? "sem_grove" : "musicnn",
    },
    notFoundIsExpected: true,
    signal,
  });

  return (Array.isArray(rsp) ? rsp : []).filter((track) => !!track.item_id);
}
