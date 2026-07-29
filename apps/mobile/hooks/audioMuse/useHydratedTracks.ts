import { useQuery } from "@tanstack/react-query";
import { getSongsByIds } from "@/services/backend/browsing";

// AudioMuse answers with ranked bare item ids plus a title/artist for display,
// but playback, artwork and favouriting all need real Child objects — so every
// AudioMuse surface hydrates through the active backend before rendering.
// Cached by the exact id list so re-entering a result set is free.
export function useHydratedTracks(ids: string[], enabled = true) {
  return useQuery({
    queryKey: ["audiomuse", "hydrate", ids],
    queryFn: () => getSongsByIds(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}
