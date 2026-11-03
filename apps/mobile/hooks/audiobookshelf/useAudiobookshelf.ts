import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { setAudiobookFinished } from "@/services/audiobookPlayback";
import { getMe } from "@/services/audiobookshelf/auth";
import {
  type AbsItemsSort,
  deleteLibraryItem,
  encodeFilter,
  getAuthor,
  getAuthors,
  getCollection,
  getCollections,
  getFilterData,
  getLibraryItem,
  getLibraryItems,
  getNarrators,
  getPersonalizedShelves,
  getSeries,
  getSeriesBooks,
  getSeriesList,
  searchLibrary,
} from "@/services/audiobookshelf/library";
import type {
  AbsLibraryItem,
  AbsMediaProgress,
  AbsSeriesRef,
} from "@/services/audiobookshelf/types";
import { useAudiobookProgressBase } from "@/stores/audiobookProgress";
import useAudiobookshelf from "@/stores/audiobookshelf";

// Audiobookshelf runs on its own host, unrelated to the music server that
// drives react-query's onlineManager, so an unreachable music server must not
// pause these queries (see hooks/tidarr/networkMode.ts).
const NETWORK_MODE = "always" as const;
const STALE_TIME = 1000 * 60 * 2;

/** Keys every query on the account, so another account's data never shows. */
function useAccountKey() {
  const serverUrl = useAudiobookshelf((s) => s.serverUrl);
  const userId = useAudiobookshelf((s) => s.userId);
  const isConnected = useAudiobookshelf((s) => s.isConnected);
  const libraryId = useAudiobookshelf((s) => s.libraryId);
  return {
    key: ["abs", serverUrl, userId] as const,
    enabled: isConnected && !!serverUrl,
    libraryId,
  };
}

export function useAudiobookshelfReady(): boolean {
  const { enabled, libraryId } = useAccountKey();
  return enabled && !!libraryId;
}

export function useAbsShelves() {
  const { key, enabled, libraryId } = useAccountKey();
  return useQuery({
    queryKey: [...key, "personalized", libraryId],
    queryFn: () => getPersonalizedShelves(libraryId as string),
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsItem(itemId: string | undefined) {
  const { key, enabled } = useAccountKey();
  return useQuery({
    queryKey: [...key, "item", itemId],
    queryFn: () => getLibraryItem(itemId as string),
    enabled: enabled && !!itemId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export interface AbsBrowseOptions {
  sort: AbsItemsSort;
  desc: boolean;
  filter?: string;
}

const PAGE_SIZE = 50;

export function useAbsLibraryItems({ sort, desc, filter }: AbsBrowseOptions) {
  const { key, enabled, libraryId } = useAccountKey();
  return useInfiniteQuery({
    queryKey: [...key, "items", libraryId, sort, desc, filter ?? null],
    queryFn: ({ pageParam }) =>
      getLibraryItems({
        libraryId: libraryId as string,
        page: pageParam,
        limit: PAGE_SIZE,
        sort,
        desc,
        filter,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      (last.page + 1) * last.limit < last.total ? last.page + 1 : undefined,
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsSeriesList() {
  const { key, enabled, libraryId } = useAccountKey();
  return useInfiniteQuery({
    queryKey: [...key, "series", libraryId],
    queryFn: ({ pageParam }) =>
      getSeriesList(libraryId as string, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      (last.page + 1) * last.limit < last.total ? last.page + 1 : undefined,
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsSeries(seriesId: string | undefined) {
  const { key, enabled, libraryId } = useAccountKey();
  const series = useQuery({
    queryKey: [...key, "series", libraryId, seriesId],
    queryFn: () => getSeries(libraryId as string, seriesId as string),
    enabled: enabled && !!libraryId && !!seriesId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
  const books = useQuery({
    queryKey: [...key, "seriesBooks", libraryId, seriesId],
    queryFn: () => getSeriesBooks(libraryId as string, seriesId as string),
    enabled: enabled && !!libraryId && !!seriesId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
  return { series, books };
}

export function useAbsAuthors() {
  const { key, enabled, libraryId } = useAccountKey();
  return useQuery({
    queryKey: [...key, "authors", libraryId],
    queryFn: () => getAuthors(libraryId as string),
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsAuthor(authorId: string | undefined) {
  const { key, enabled } = useAccountKey();
  return useQuery({
    queryKey: [...key, "author", authorId],
    queryFn: () => getAuthor(authorId as string),
    enabled: enabled && !!authorId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsNarrators() {
  const { key, enabled, libraryId } = useAccountKey();
  return useQuery({
    queryKey: [...key, "narrators", libraryId],
    queryFn: () => getNarrators(libraryId as string),
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsCollections() {
  const { key, enabled, libraryId } = useAccountKey();
  return useQuery({
    queryKey: [...key, "collections", libraryId],
    queryFn: () => getCollections(libraryId as string),
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsCollection(collectionId: string | undefined) {
  const { key, enabled } = useAccountKey();
  return useQuery({
    queryKey: [...key, "collection", collectionId],
    queryFn: () => getCollection(collectionId as string),
    enabled: enabled && !!collectionId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
}

export function useAbsFilterData() {
  const { key, enabled, libraryId } = useAccountKey();
  return useQuery({
    queryKey: [...key, "filterdata", libraryId],
    queryFn: () => getFilterData(libraryId as string),
    enabled: enabled && !!libraryId,
    networkMode: NETWORK_MODE,
    staleTime: 1000 * 60 * 10,
  });
}

const MIN_QUERY_LENGTH = 2;

export function useAbsSearch(term: string) {
  const { key, enabled, libraryId } = useAccountKey();
  const trimmed = term.trim();
  const searchable = trimmed.length >= MIN_QUERY_LENGTH;
  return useQuery({
    queryKey: [...key, "search", libraryId, trimmed],
    queryFn: () => searchLibrary(libraryId as string, trimmed),
    enabled: enabled && !!libraryId && searchable,
    networkMode: NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
    placeholderData: searchable ? keepPreviousData : undefined,
  });
}

function useAbsMe() {
  const { key, enabled } = useAccountKey();
  return useQuery({
    queryKey: [...key, "me"],
    queryFn: getMe,
    enabled,
    networkMode: NETWORK_MODE,
    staleTime: 1000 * 30,
  });
}

export interface AbsBookProgress {
  progress: number;
  currentTime: number;
  duration: number;
  isFinished: boolean;
}

/**
 * Listening progress per book: the server's, overlaid with whatever this
 * device recorded more recently (playback in progress, or offline listening
 * not uploaded yet).
 */
export function useAbsProgressMap(): Map<string, AbsBookProgress> {
  const { data } = useAbsMe();
  const local = useAudiobookProgressBase((s) => s.positions);
  return useMemo(() => {
    const map = new Map<string, AbsBookProgress>();
    const server = new Map<string, AbsMediaProgress>();
    for (const progress of data?.mediaProgress ?? []) {
      if (progress.episodeId) continue;
      server.set(progress.libraryItemId, progress);
      map.set(progress.libraryItemId, {
        progress: progress.progress,
        currentTime: progress.currentTime,
        duration: progress.duration,
        isFinished: progress.isFinished,
      });
    }
    for (const [itemId, position] of Object.entries(local)) {
      const remote = server.get(itemId);
      if (remote && remote.lastUpdate > position.updatedAt) continue;
      map.set(itemId, {
        progress:
          position.duration > 0 ? position.currentTime / position.duration : 0,
        currentTime: position.currentTime,
        duration: position.duration,
        isFinished: position.isFinished,
      });
    }
    return map;
  }, [data, local]);
}

export function useAbsBookProgress(
  itemId: string | undefined,
): AbsBookProgress | undefined {
  const map = useAbsProgressMap();
  return itemId ? map.get(itemId) : undefined;
}

export function useSetAudiobookFinished() {
  return useMutation({
    mutationFn: ({ itemId, finished }: { itemId: string; finished: boolean }) =>
      setAudiobookFinished(itemId, finished),
    networkMode: NETWORK_MODE,
  });
}

export function useDeleteAudiobook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      deleteFiles,
    }: {
      itemId: string;
      deleteFiles: boolean;
    }) => deleteLibraryItem(itemId, deleteFiles),
    networkMode: NETWORK_MODE,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["abs"] });
    },
  });
}

const MORE_LIKE_THIS_LIMIT = 20;

function seriesRefs(item: AbsLibraryItem | undefined): AbsSeriesRef[] {
  const series = item?.media.metadata.series;
  if (!series) return [];
  return Array.isArray(series) ? series : [series];
}

/**
 * Books to suggest from a book's page. Audiobookshelf has no recommendation
 * endpoint, so this is what a listener would look for next: the rest of the
 * series, then the same authors, then the same genre.
 */
export function useAbsMoreLikeThis(item: AbsLibraryItem | undefined) {
  const { key, enabled, libraryId } = useAccountKey();
  const seriesId = seriesRefs(item)[0]?.id;
  const authorId = item?.media.metadata.authors?.[0]?.id;
  const genre = item?.media.metadata.genres?.[0];
  const ready = enabled && !!libraryId && !!item;

  const series = useQuery({
    queryKey: [...key, "seriesBooks", libraryId, seriesId],
    queryFn: () => getSeriesBooks(libraryId as string, seriesId as string),
    enabled: ready && !!seriesId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
  const author = useQuery({
    queryKey: [...key, "author", authorId],
    queryFn: () => getAuthor(authorId as string),
    enabled: ready && !!authorId,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });
  const byGenre = useQuery({
    queryKey: [...key, "genreBooks", libraryId, genre],
    queryFn: () =>
      getLibraryItems({
        libraryId: libraryId as string,
        page: 0,
        limit: MORE_LIKE_THIS_LIMIT,
        sort: "addedAt",
        desc: true,
        filter: encodeFilter("genres", genre as string),
      }),
    enabled: ready && !!genre,
    networkMode: NETWORK_MODE,
    staleTime: STALE_TIME,
  });

  const books = useMemo(() => {
    const seen = new Set<string>(item ? [item.id] : []);
    const out: AbsLibraryItem[] = [];
    for (const candidate of [
      ...(series.data ?? []),
      ...(author.data?.libraryItems ?? []),
      ...(byGenre.data?.results ?? []),
    ]) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      out.push(candidate);
      if (out.length >= MORE_LIKE_THIS_LIMIT) break;
    }
    return out;
  }, [item, series.data, author.data, byGenre.data]);

  return {
    books,
    isLoading: series.isLoading || author.isLoading || byGenre.isLoading,
  };
}
