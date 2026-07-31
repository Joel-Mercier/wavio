import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { downloadMatchKey } from "@/services/soulsync/downloads";
import {
  fetchWishlist,
  wishlistArtworkUrl,
} from "@/services/soulsync/wishlist";
import useSoulSync from "@/stores/soulsync";

export const soulSyncWishlistKey = ["soulsync", "wishlist"];

export function useSoulSyncWishlist() {
  const isConnected = useSoulSync((store) => store.isConnected);
  return useQuery({
    queryKey: soulSyncWishlistKey,
    queryFn: fetchWishlist,
    enabled: isConnected,
    // Half the queue's cadence: a download that starts between two queue polls
    // would otherwise render without its cover until the screen remounted.
    refetchInterval: 30000,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 1000 * 30,
  });
}

// Cover art for the queue, keyed the way tasks are matched everywhere else.
// /downloads carries no artwork, but a track stays on the wishlist until it
// downloads successfully — so anything still in flight can be looked up here.
export function useSoulSyncQueueArtwork() {
  const { data } = useSoulSyncWishlist();
  return useMemo(() => {
    const byTrack = new Map<string, string>();
    for (const row of data ?? []) {
      const url = wishlistArtworkUrl(row);
      if (!url) continue;
      byTrack.set(downloadMatchKey(row.track_name, row.artist_name), url);
    }
    return byTrack;
  }, [data]);
}
