import axios from "axios";
import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMuseMoodCentroids,
  AudioMuseTrack,
} from "@/services/audioMuse/types";

// Nearest-neighbour search over the IVF index AudioMuse builds from its audio
// analysis: unlike the backend's own getSimilarSongs (metadata / last.fm
// relations), this compares how the tracks actually sound. The endpoint belongs
// to the core `ivf_bp` blueprint, so every deployment serves it — what it needs
// is an analysed library, not an opt-in feature.
export const SIMILAR_MIN_RESULTS = 1;
export const SIMILAR_MAX_RESULTS = 200;
export const SIMILAR_DEFAULT_RESULTS = 25;

// A vector query plus the radius walk runs well past the instance-wide 15s
// reachability budget on a cold index the worker still has to page in.
const SIMILAR_TIMEOUT_MS = 60_000;

export interface SimilarTracksOptions {
  /** The track to search around, as the active backend ids it. */
  itemId: string;
  numResults: number;
  /** Caps how many tracks one artist may contribute (`eliminate_duplicates`). */
  limitPerArtist: boolean;
  /** Buckets neighbours by distance and orders them for a smoother flow. */
  radiusSimilarity: boolean;
  signal?: AbortSignal;
}

export function clampSimilarResults(count: number): number {
  if (!Number.isFinite(count)) return SIMILAR_DEFAULT_RESULTS;
  return Math.min(
    SIMILAR_MAX_RESULTS,
    Math.max(SIMILAR_MIN_RESULTS, Math.round(count)),
  );
}

/**
 * The tracks that sound closest to `itemId`, nearest first. AudioMuse answers
 * 404 both for a track missing from the index and for a search that matched
 * nothing — neither is a failure the user can act on differently, so both become
 * an empty list and the screen explains it from the analysis counts.
 */
export async function findSimilarTracks({
  itemId,
  numResults,
  limitPerArtist,
  radiusSimilarity,
  signal,
}: SimilarTracksOptions): Promise<AudioMuseTrack[]> {
  try {
    const rsp = await audioMuseRequest<AudioMuseTrack[]>(
      "/api/similar_tracks",
      {
        params: {
          item_id: itemId,
          n: clampSimilarResults(numResults),
          // Omitting either would hand the deployment's own default back, so
          // the toggles would silently do nothing on some instances.
          eliminate_duplicates: String(limitPerArtist),
          radius_similarity: String(radiusSimilarity),
        },
        timeout: SIMILAR_TIMEOUT_MS,
        notFoundIsExpected: true,
        signal,
      },
    );
    // The endpoint excludes the seed itself, but it is the one id the caller
    // already has — dropping it defensively keeps "similar to X" from ever
    // opening with X.
    return (Array.isArray(rsp) ? rsp : []).filter(
      (track) => track.item_id && track.item_id !== itemId,
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
}

/**
 * A seed that is a point in the embedding space rather than a track: one cluster
 * of a mood, or an anchor the user saved. The same endpoint serves both — it
 * searches around the vector instead of around a song — which is why they share
 * everything below with the track-seeded search.
 */
export type SimilaritySeed =
  | { kind: "mood"; mood: string; centroidIndex: number }
  | { kind: "anchor"; id: number };

export interface VectorSimilarityOptions {
  seed: SimilaritySeed;
  numResults: number;
  limitPerArtist: boolean;
  signal?: AbortSignal;
}

function seedParams(seed: SimilaritySeed): Record<string, string | number> {
  return seed.kind === "mood"
    ? { mood: seed.mood, centroid_index: seed.centroidIndex }
    : { anchor_id: seed.id };
}

/**
 * The tracks that sound closest to a mood cluster or an anchor, nearest first.
 *
 * `radius_similarity` is deliberately absent: the endpoint only applies it to
 * the track-seeded branch, so sending it here would offer a toggle that does
 * nothing. As with findSimilarTracks, a 404 means the search came back empty
 * rather than that anything failed.
 */
export async function findSimilarToSeed({
  seed,
  numResults,
  limitPerArtist,
  signal,
}: VectorSimilarityOptions): Promise<AudioMuseTrack[]> {
  try {
    const rsp = await audioMuseRequest<AudioMuseTrack[]>(
      "/api/similar_tracks",
      {
        params: {
          ...seedParams(seed),
          n: clampSimilarResults(numResults),
          // Omitting it would hand the deployment's own default back, so the
          // toggle would silently do nothing on some instances.
          eliminate_duplicates: String(limitPerArtist),
        },
        timeout: SIMILAR_TIMEOUT_MS,
        notFoundIsExpected: true,
        signal,
      },
    );
    return (Array.isArray(rsp) ? rsp : []).filter((track) => !!track.item_id);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
}

/**
 * The moods AudioMuse can search around, each split into clusters carrying the
 * tags that dominate them. Precomputed and shipped with the server, so this
 * answers on any deployment — including one that has analysed nothing, where
 * every search around them still comes back empty.
 */
export async function getMoodCentroids(): Promise<AudioMuseMoodCentroids> {
  const rsp = await audioMuseRequest<AudioMuseMoodCentroids>(
    "/api/mood_centroids",
    // Read straight off a file the deployment ships; no media server involved.
    { skipServerScope: true, notFoundIsExpected: true },
  );
  return rsp && typeof rsp === "object" ? rsp : {};
}
