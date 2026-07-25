import { useMemo } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { Child } from "@/services/openSubsonic/types";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
} from "@/utils/sort";
import {
  TRACK_SORT_FIELDS,
  TRACK_SORT_SPECS,
  type TrackSortType,
  trackSortEnabled,
} from "@/utils/trackSort";

// The sort a track list actually renders with: the persisted preference, unless
// its field isn't offerable for these tracks on this backend (see
// utils/sort.ts). A list screen and its search screen must derive it from the
// same place or they end up showing the same tracks in different orders.
export function useTrackSort(
  tracks: Child[] | undefined,
  sort: TrackSortType,
  fallback: TrackSortType = "addedAtAsc",
) {
  const capabilities = useCapabilities();
  const sortFields = useMemo(
    () =>
      availableSortFields(
        tracks ?? [],
        TRACK_SORT_SPECS,
        TRACK_SORT_FIELDS,
        trackSortEnabled(capabilities),
      ),
    [tracks, capabilities],
  );
  const activeSort = effectiveSort(sort, sortFields, fallback);
  return {
    sortFields,
    activeSort,
    activeSortField: parseSortType(activeSort).field,
  };
}
