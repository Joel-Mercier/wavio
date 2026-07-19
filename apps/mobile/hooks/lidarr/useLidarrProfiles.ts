import { useQuery } from "@tanstack/react-query";
import {
  getMetadataProfiles,
  getQualityProfiles,
  getRootFolders,
} from "@/services/lidarr";
import useLidarr from "@/stores/lidarr";

// Loads the quality/metadata profiles and root folders used by the discovery
// filters sheet and the add flow. One-shot (rarely changes), cached an hour.
export function useLidarrProfiles() {
  const isConnected = useLidarr((store) => store.isConnected);
  const staleTime = 1000 * 60 * 60;

  const qualityProfiles = useQuery({
    queryKey: ["lidarr", "qualityProfiles"],
    queryFn: getQualityProfiles,
    enabled: isConnected,
    staleTime,
  });
  const metadataProfiles = useQuery({
    queryKey: ["lidarr", "metadataProfiles"],
    queryFn: getMetadataProfiles,
    enabled: isConnected,
    staleTime,
  });
  const rootFolders = useQuery({
    queryKey: ["lidarr", "rootFolders"],
    queryFn: getRootFolders,
    enabled: isConnected,
    staleTime,
  });

  return {
    qualityProfiles: qualityProfiles.data ?? [],
    metadataProfiles: metadataProfiles.data ?? [],
    rootFolders: rootFolders.data ?? [],
    isLoading:
      qualityProfiles.isLoading ||
      metadataProfiles.isLoading ||
      rootFolders.isLoading,
  };
}
