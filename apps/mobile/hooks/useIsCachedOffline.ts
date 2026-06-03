import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import {
  getIsCacheRestoring,
  subscribeCacheRestoring,
} from "@/config/queryClient";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";

// Returns whether a collection row (album / artist / playlist) should be
// ENABLED. When online — or while the persisted cache is still restoring — it's
// always enabled (tapping fetches & caches as usual). When offline, it's
// enabled only if the detail query for `detailKey` is already in the cache, so
// the destination screen has data to show. Mirrors the per-track offline rule
// in TrackListItem (which gates on "downloaded" instead).
//
// Pass `null` for item types with no cacheable detail (e.g. folders/podcasts)
// to leave them always enabled.
export function useIsCachedOffline(detailKey: QueryKey | null): boolean {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (cb: () => void) => {
      const unsubOnline = subscribeEffectiveOnline(cb);
      const unsubRestoring = subscribeCacheRestoring(cb);
      const unsubCache = queryClient.getQueryCache().subscribe(cb);
      return () => {
        unsubOnline();
        unsubRestoring();
        unsubCache();
      };
    },
    [queryClient],
  );

  const getSnapshot = useCallback(() => {
    if (detailKey === null) return true;
    if (getIsEffectivelyOnline() || getIsCacheRestoring()) return true;
    return queryClient.getQueryData(detailKey) !== undefined;
    // detailKey is a fresh array each render; depend on its serialized form.
  }, [queryClient, JSON.stringify(detailKey)]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
