import {
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { tidarrQueueKey } from "@/hooks/tidarr/useTidarrDownloads";
import { useTidarrSettings } from "@/hooks/tidarr/useTidarrSettings";
import { enqueueItem } from "@/services/tidarr/download";
import type {
  TidarrItemType,
  TidarrQuality,
  TidarrQueueItem,
} from "@/services/tidarr/types";
import useTidarr from "@/stores/tidarr";

// The quality queued items carry: the user's override when they set one, null
// to defer to whatever the instance itself is configured for. An instance
// running with LOCK_QUALITY has deliberately taken the choice away, so no
// override is sent even if one is still stored from before the lock.
export function useQueueQuality(): TidarrQuality | null {
  const quality = useTidarr((store) => store.quality);
  const { data: settings } = useTidarrSettings();
  if (settings?.parameters?.LOCK_QUALITY === "true") return null;
  return quality;
}

const tidarrEnqueueKey = ["tidarr", "enqueue"];

export function useEnqueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: tidarrEnqueueKey,
    mutationFn: (item: TidarrQueueItem) => enqueueItem(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tidarrQueueKey });
    },
  });
}

// Rows live in a FlashList, which recycles component instances instead of
// remounting them: a row reading its own mutation's `isPending` would keep
// showing the spinner for whatever item scrolled into its cell. Deriving it
// from the in-flight mutations, matched on the item itself, keeps the spinner
// on the row that was actually tapped. Tidal's id spaces overlap, so the type
// is part of the match.
export function useIsEnqueuing(
  type: TidarrItemType,
  id: string | number,
): boolean {
  const pending = useMutationState({
    filters: { mutationKey: tidarrEnqueueKey, status: "pending" },
    select: (mutation) => {
      const item = mutation.state.variables as TidarrQueueItem | undefined;
      return item ? `${item.type}:${item.id}` : "";
    },
  });
  return pending.includes(`${type}:${id}`);
}
