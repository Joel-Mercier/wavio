import axios from "axios";
import { audioMuseRequest } from "@/services/audioMuse";
import type { AudioMuseSimilarArtist } from "@/services/audioMuse/types";

// AudioMuse fits a Gaussian Mixture Model per artist over its audio analysis and
// compares those models, so this answers "sounds like" where the backend's own
// getArtistInfo2 answers "listeners also played". Both are worth showing, which
// is why the artist screen keeps them in separate, separately-labelled rows.
export const SIMILAR_ARTISTS_DEFAULT_RESULTS = 12;

export interface SimilarArtistsOptions {
  /** The seed artist's name — what the index is actually keyed by. */
  artistName?: string;
  /** Only used when the name is unknown; see findSimilarArtists. */
  artistId?: string;
  numResults?: number;
  signal?: AbortSignal;
}

/**
 * The artists that sound closest to the seed, nearest first.
 *
 * Two failures are ordinary empty states rather than errors: 404 is "this artist
 * isn't in the index, or nothing matched", and 503 is "the artist index was never
 * built". Neither is something the user can act on from the artist screen — the
 * integration screen is where the library's analysis state is explained — so both
 * collapse to an empty list and the row simply doesn't render.
 */
export async function findSimilarArtists({
  artistName,
  artistId,
  numResults = SIMILAR_ARTISTS_DEFAULT_RESULTS,
  signal,
}: SimilarArtistsOptions): Promise<AudioMuseSimilarArtist[]> {
  const name = artistName?.trim();
  if (!name && !artistId) return [];

  try {
    const rsp = await audioMuseRequest<AudioMuseSimilarArtist[]>(
      "/api/similar_artists",
      {
        params: {
          // The index is keyed by artist name; an id only gets resolved back to
          // one through AudioMuse's media-server registry, a hop that fails for
          // artists it can't map. `artist` also wins server-side when both are
          // sent, so passing both would make the id dead weight.
          ...(name ? { artist: name } : { artist_id: artistId }),
          n: numResults,
        },
        notFoundIsExpected: true,
        serviceUnavailableIsExpected: true,
        signal,
      },
    );
    return (Array.isArray(rsp) ? rsp : []).filter((artist) => !!artist.artist);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404 || status === 503) return [];
    }
    throw error;
  }
}
