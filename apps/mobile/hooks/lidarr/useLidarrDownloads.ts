import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHistory } from "@/services/lidarr/history";
import {
  cancelQueueItem,
  fetchQueue,
  type LidarrQueueItem,
} from "@/services/lidarr/queue";
import useLidarr from "@/stores/lidarr";

// Polls the Lidarr download queue. Shared by the downloads screen and the
// root-mounted watcher (react-query dedupes the query), so there's a single
// poll driving both the UI and the auto-scan-on-finish side effect.
export function useLidarrQueue() {
  const isConnected = useLidarr((s) => s.isConnected);
  return useQuery({
    queryKey: ["lidarr", "queue"],
    queryFn: fetchQueue,
    enabled: isConnected,
    refetchInterval: 15000,
    staleTime: 0,
  });
}

export function useCancelDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: LidarrQueueItem) => cancelQueueItem(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", "queue"] });
    },
  });
}

export function useLidarrHistory() {
  const isConnected = useLidarr((s) => s.isConnected);
  return useQuery({
    queryKey: ["lidarr", "history"],
    queryFn: fetchHistory,
    enabled: isConnected,
    staleTime: 1000 * 30,
  });
}
