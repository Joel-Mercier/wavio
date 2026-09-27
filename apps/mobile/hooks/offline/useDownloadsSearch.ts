import { useEffect, useMemo, useState } from "react";
import { createSearchIndex, type SearchIndex } from "@/services/searchIndex";
import type { OfflineTrack } from "@/stores/offline";
import { sortItems } from "@/utils/sort";
import {
  OFFLINE_TRACK_SORT_SPECS,
  type OfflineTrackSortType,
} from "@/utils/trackSort";

const SEARCH_KEYS = ["title", "artist", "album"];

// Fuzzy search over every download (20k on big libraries) blocks the JS thread
// for seconds on Hermes. The index is built on the first search and kept until
// the list changes, and each search runs a frame after `isSearching` flips so
// the screen can show skeletons instead of freezing on stale rows. Hits keep
// relevance order, ties falling back to the sort.
export function useDownloadsSearch(
  tracks: OfflineTrack[],
  sort: OfflineTrackSortType,
  query: string,
): { data: OfflineTrack[]; isSearching: boolean } {
  const sorted = useMemo(
    () => sortItems(tracks, sort, OFFLINE_TRACK_SORT_SPECS),
    [tracks, sort],
  );

  const [searched, setSearched] = useState({ tracks, query });
  const upToDate = searched.tracks === tracks && searched.query === query;

  useEffect(() => {
    if (upToDate) return;
    const frame = requestAnimationFrame(() => setSearched({ tracks, query }));
    return () => cancelAnimationFrame(frame);
  }, [upToDate, tracks, query]);

  const getIndex = useMemo(() => {
    let index: SearchIndex<OfflineTrack> | undefined;
    return () => {
      index ??= createSearchIndex(searched.tracks, SEARCH_KEYS);
      return index;
    };
  }, [searched.tracks]);

  const hits = useMemo(
    () => (searched.query.length > 0 ? getIndex().search(searched.query) : []),
    [getIndex, searched.query],
  );

  const results = useMemo(() => {
    if (hits.length === 0) return [];
    const rank = new Map(sorted.map((track, i) => [track.id, i]));
    return [...hits]
      .sort(
        (a, b) =>
          (a.score ?? 0) - (b.score ?? 0) ||
          (rank.get(a.item.id) ?? 0) - (rank.get(b.item.id) ?? 0),
      )
      .map((hit) => hit.item);
  }, [hits, sorted]);

  if (query.length === 0) return { data: sorted, isSearching: false };
  if (!upToDate) return { data: [], isSearching: true };
  return { data: results, isSearching: false };
}
