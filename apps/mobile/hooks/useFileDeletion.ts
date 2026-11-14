import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/useCapabilities";
import { canDeleteItem } from "@/services/backend/deletion";
import useApp from "@/stores/app";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

/** Permanent deletion is offered: the backend can do it and the user opted in. */
export function useFileDeletionAvailable(): boolean {
  const { fileDeletion } = useCapabilities();
  const enabled = useApp((state) => state.fileDeletionEnabled);
  return fileDeletion && enabled;
}

/**
 * Whether this user may delete every one of the items, asked only once the
 * section asking is open. Dropped as soon as nothing reads it: a permission is
 * not worth trusting from a cache.
 */
export function useCanDeleteItems(ids: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["canDeleteItem", ...ids],
    queryFn: async () =>
      (await mapWithConcurrency(ids, 4, canDeleteItem)).every(Boolean),
    enabled: enabled && ids.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
}
