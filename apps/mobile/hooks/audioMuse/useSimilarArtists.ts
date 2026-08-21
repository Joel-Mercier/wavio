import { useQuery } from "@tanstack/react-query";
import {
  findSimilarArtists,
  SIMILAR_ARTISTS_DEFAULT_RESULTS,
} from "@/services/audioMuse/artists";
import { retryUnlessClientError } from "@/services/retry";
import useAudioMuse, {
  selectSimilarArtistsAvailable,
} from "@/stores/audioMuse";

// The artists that sound closest to a seed. Unlike the similar-*tracks* screen
// this feeds an inline row rather than a generator the user drives, so it goes
// through react-query for caching and deduplication instead of an imperative
// call with its own AbortController.
export function useSimilarArtists(
  { artistId, artistName }: { artistId: string; artistName?: string },
  {
    enabled = true,
    numResults = SIMILAR_ARTISTS_DEFAULT_RESULTS,
  }: { enabled?: boolean; numResults?: number } = {},
) {
  const available = useAudioMuse(selectSimilarArtistsAvailable);
  const name = artistName?.trim();

  return useQuery({
    // Keyed by whatever is actually sent, so the row doesn't refetch when the
    // artist's name lands after its id.
    queryKey: ["audiomuse", "similarArtists", name || artistId, numResults],
    queryFn: ({ signal }) =>
      findSimilarArtists({
        artistName: name,
        artistId,
        numResults,
        signal,
      }),
    enabled: enabled && available && !!(name || artistId),
    staleTime: 1000 * 60 * 5,
    retry: retryUnlessClientError,
  });
}
