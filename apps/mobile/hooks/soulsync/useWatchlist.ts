import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import {
  addToWatchlist,
  fetchWatchlist,
  removeFromWatchlist,
  scanWatchlist,
} from "@/services/soulsync/watchlist";
import useSoulSync from "@/stores/soulsync";

const watchlistKey = ["soulsync", "watchlist"];

export function useSoulSyncWatchlist() {
  const isConnected = useSoulSync((store) => store.isConnected);
  return useQuery({
    queryKey: watchlistKey,
    queryFn: fetchWatchlist,
    enabled: isConnected,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 1000 * 60,
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addToWatchlist,
    networkMode: SOULSYNC_NETWORK_MODE,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKey });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeFromWatchlist,
    networkMode: SOULSYNC_NETWORK_MODE,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKey });
    },
  });
}

// Asks SoulSync to check every watched artist for releases it doesn't have yet.
// Anything it finds lands in the download queue, so refresh that too.
export function useScanWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: scanWatchlist,
    networkMode: SOULSYNC_NETWORK_MODE,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["soulsync"] });
    },
  });
}
