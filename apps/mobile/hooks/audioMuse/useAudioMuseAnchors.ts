import { useQuery } from "@tanstack/react-query";
import { retryUnlessClientError } from "@/services/audioMuse";
import { listAnchors } from "@/services/audioMuse/anchors";
import useAudioMuse, { selectSimilarTracksAvailable } from "@/stores/audioMuse";

// The deployment's saved Alchemy anchors, shared by every surface that accepts
// one as a seed. Fetched when a picker opens rather than probed on connect: the
// user creates them in AudioMuse's own web UI, so the list changes without
// anything happening on this side.
export function useAudioMuseAnchors({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const available = useAudioMuse(selectSimilarTracksAvailable);

  return useQuery({
    queryKey: ["audiomuse", "anchors"],
    queryFn: () => listAnchors(),
    enabled: enabled && available,
    staleTime: 1000 * 60 * 5,
    retry: retryUnlessClientError,
  });
}
