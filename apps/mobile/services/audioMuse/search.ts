import axios from "axios";
import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMuseSearchResponse,
  AudioMuseTrack,
} from "@/services/audioMuse/types";

const DEFAULT_LIMIT = 50;

// CLAP text-to-audio search: matches the *sound* of a track against a plain
// description ("calm piano songs"), not its metadata.
export async function soundSearch(
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<AudioMuseTrack[]> {
  const rsp = await audioMuseRequest<AudioMuseSearchResponse>(
    "/api/clap/search",
    { method: "post", data: { query, limit } },
  );
  return rsp.results ?? [];
}

// Semantic lyrics search: matches theme and meaning rather than exact words.
// AudioMuse answers 404 when nothing matches, which is an empty result, not a
// failure — every other status still throws.
export async function lyricsSearch(
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<AudioMuseTrack[]> {
  try {
    const rsp = await audioMuseRequest<AudioMuseSearchResponse>(
      "/api/lyrics/search/text",
      {
        method: "post",
        data: { query, limit },
        notFoundIsExpected: true,
      },
    );
    return rsp.results ?? [];
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
}
