import { useQuery } from "@tanstack/react-query";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { fetchQueue } from "@/services/soulsync/downloads";
import { fetchRecentlyAddedAlbums } from "@/services/soulsync/library";
import useSoulSync from "@/stores/soulsync";

export const soulSyncQueueKey = ["soulsync", "queue"];

// Polls the SoulSync download queue. 15s matches the Lidarr downloads poll and
// leaves plenty of the 60 req/min budget for searches and request polling.
export function useSoulSyncQueue() {
  const isConnected = useSoulSync((store) => store.isConnected);
  return useQuery({
    queryKey: soulSyncQueueKey,
    queryFn: fetchQueue,
    enabled: isConnected,
    refetchInterval: 15000,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 0,
  });
}

// Stands in for the download history the API doesn't expose. Refetched on the
// same tick as the queue so a download that just finished shows up as soon as
// SoulSync has imported it.
export function useSoulSyncRecentlyAdded() {
  const isConnected = useSoulSync((store) => store.isConnected);
  return useQuery({
    queryKey: ["soulsync", "recentlyAdded"],
    queryFn: () => fetchRecentlyAddedAlbums(),
    enabled: isConnected,
    refetchInterval: 15000,
    networkMode: SOULSYNC_NETWORK_MODE,
  });
}
