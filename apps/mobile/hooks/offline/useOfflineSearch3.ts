import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import {
  getIsCacheRestoring,
  subscribeCacheRestoring,
} from "@/config/queryClient";
import {
  buildOfflineSearchCorpus,
  createOfflineSearchIndex,
  searchOfflineIndex,
} from "@/services/offline/searchCorpus";
import type { SearchResult3 } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

// Synchronous, offline replacement for the server `search3` query, mirroring its
// `data` / `isLoading` / `error` surface so `useSearch3`'s consumers don't
// change. Everything is a pure `useMemo` pipeline (no react-query query): no
// retries/invalidation, and offline results never pollute the persisted
// `["search3", ...]` cache namespace.

type OfflineSearch3Params = {
  artistCount?: number;
  artistOffset?: number;
  albumCount?: number;
  albumOffset?: number;
  songCount?: number;
  songOffset?: number;
  musicFolderId?: string;
};

const EMPTY_INDEX = createOfflineSearchIndex({
  songs: [],
  albums: [],
  artists: [],
});

export function useOfflineSearch3(
  query: string,
  params: OfflineSearch3Params,
  { enabled }: { enabled: boolean },
): {
  data: { searchResult3: SearchResult3 } | undefined;
  isLoading: false;
  error: null;
} {
  const queryClient = useQueryClient();
  const restoring = useSyncExternalStore(
    subscribeCacheRestoring,
    getIsCacheRestoring,
  );
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  const downloadedCollections = useOffline((s) => s.downloadedCollections);

  // `restoring` is an intentional cache-busting dependency (its value isn't read
  // inside the memo) so the corpus rebuilds once the persisted cache finishes
  // hydrating — we never block or show a skeleton while it's still restoring.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  const index = useMemo(() => {
    if (!enabled) return EMPTY_INDEX;
    const corpus = buildOfflineSearchCorpus(
      queryClient,
      downloadedTracks,
      downloadedCollections,
    );
    return createOfflineSearchIndex(corpus);
  }, [
    enabled,
    restoring,
    queryClient,
    downloadedTracks,
    downloadedCollections,
  ]);

  // musicFolderId is ignored offline: downloads and the persisted cache aren't
  // folder-scoped, so there's nothing to filter on. `data` is undefined for an
  // empty query, mirroring the online `enabled: query.length > 0` gate.
  const data = useMemo(() => {
    if (!enabled || query.length === 0) return undefined;
    return {
      searchResult3: searchOfflineIndex(index, query, {
        artistCount: params.artistCount,
        albumCount: params.albumCount,
        songCount: params.songCount,
      }),
    };
  }, [
    enabled,
    index,
    query,
    params.artistCount,
    params.albumCount,
    params.songCount,
  ]);

  return { data, isLoading: false, error: null };
}
