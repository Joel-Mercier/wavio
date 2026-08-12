import { useMemo } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import {
  DEFAULT_SONG_SORT,
  type SongSortField,
  type SongSortType,
  songSortFields,
  songSortParam,
} from "@/utils/songSort";
import { effectiveSort } from "@/utils/sort";

// The sort the whole-library track browse actually runs with: the persisted
// preference, unless its field isn't offerable on this backend (see
// utils/songSort.ts). `sortParam` is what goes to the backend — and therefore
// into the react-query key — so anything that has to reproduce that key
// (components/library/LibraryListItem's offline-reachability check) derives it
// from here rather than assuming the default.
export function useSongSort(): {
  sortFields: SongSortField[];
  activeSort: SongSortType;
  sortParam: SongSortType | undefined;
} {
  const capabilities = useCapabilities();
  const serverType = useAuthBase((store) => store.serverType);
  const hasNavidromeNative = useAuthBase((store) => store.hasNavidromeNative);
  const sort = useApp((store) => store.allTracksSort);
  const sortFields = useMemo(
    () => songSortFields(serverType, capabilities, hasNavidromeNative),
    [serverType, capabilities, hasNavidromeNative],
  );
  const activeSort = effectiveSort(sort, sortFields, DEFAULT_SONG_SORT);
  return { sortFields, activeSort, sortParam: songSortParam(activeSort) };
}
