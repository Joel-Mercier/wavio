import { useQuery } from "@tanstack/react-query";
import { retryUnlessClientError } from "@/services/audioMuse";
import { getMoodCentroids } from "@/services/audioMuse/similar";
import useAudioMuse, { selectSimilarTracksAvailable } from "@/stores/audioMuse";

// The mood catalogue is a ~1MB file the server parses once and then answers
// from, so it never changes for a running deployment — cached for the session
// rather than refetched per picker open.
export function useMoodCentroids({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const available = useAudioMuse(selectSimilarTracksAvailable);

  return useQuery({
    queryKey: ["audiomuse", "moodCentroids"],
    queryFn: () => getMoodCentroids(),
    enabled: enabled && available,
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryUnlessClientError,
  });
}
