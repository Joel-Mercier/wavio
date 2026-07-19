import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReleases,
  grabRelease,
  type LidarrRelease,
} from "@/services/lidarr";
import useLidarr from "@/stores/lidarr";

// Interactive release search for an album already in Lidarr. Disabled until an
// internal albumId is available; not retried (it's a live indexer query the
// user explicitly triggered).
export function useReleases(albumId: number | undefined) {
  const isConnected = useLidarr((s) => s.isConnected);
  return useQuery({
    queryKey: ["lidarr", "releases", albumId],
    queryFn: () => getReleases(albumId as number),
    enabled: isConnected && albumId != null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useGrabRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (release: LidarrRelease) => grabRelease(release),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", "queue"] });
    },
  });
}
