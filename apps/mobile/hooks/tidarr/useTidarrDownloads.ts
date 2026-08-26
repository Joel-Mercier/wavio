import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TIDARR_NETWORK_MODE } from "@/hooks/tidarr/networkMode";
import { fetchDownloadedIds } from "@/services/tidarr/history";
import {
  fetchQueue,
  removeFinishedItems,
  removeQueueItem,
  retryFailed,
} from "@/services/tidarr/queue";
import useTidarr from "@/stores/tidarr";

export const tidarrQueueKey = ["tidarr", "queue"];

// Polls the Tidarr download queue. Shared by the downloads screen and the
// root-mounted watcher (react-query dedupes the query), so there's a single
// poll driving both the UI and the auto-scan-on-finish side effect.
export function useTidarrQueue() {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: tidarrQueueKey,
    queryFn: fetchQueue,
    enabled: isConnected,
    networkMode: TIDARR_NETWORK_MODE,
    refetchInterval: 15000,
    staleTime: 0,
  });
}

export function useCancelDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeQueueItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tidarrQueueKey });
    },
  });
}

// Tidarr keeps finished and errored items in the queue forever; this is the
// only way they leave it.
export function useClearFinished() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeFinishedItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tidarrQueueKey });
    },
  });
}

export function useRetryFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryFailed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tidarrQueueKey });
    },
  });
}

// Ids Tidarr has already downloaded, so a result can be marked as such. Empty
// on instances running without ENABLE_HISTORY, which is a silent no-op here.
export function useDownloadedIds() {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: ["tidarr", "downloadedIds"],
    queryFn: fetchDownloadedIds,
    enabled: isConnected,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60,
  });
}
