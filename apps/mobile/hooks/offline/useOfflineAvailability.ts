import {
  hashKey,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  getIsCacheRestoring,
  subscribeCacheRestoring,
} from "@/config/queryClient";
import { useIsOnline } from "@/hooks/useIsOnline";
import { collectionCreditsArtist } from "@/services/offline/collections";
import type {
  AlbumWithSongsID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

// "Can I open/play this offline?" — the availability axis, separate from raw
// download state (useDownloads) and from saving a collection
// (useCollectionDownload).

type CollectionKind = "album" | "playlist";

const noopUnsubscribe = () => {};

function useIsCacheRestoring(): boolean {
  return useSyncExternalStore(subscribeCacheRestoring, getIsCacheRestoring);
}

// Watch one query rather than the whole cache. These hooks run once per list
// row, so a bare `getQueryCache().subscribe(cb)` means every cache event walks
// hundreds of listeners and re-reads hundreds of snapshots — on a screen like
// the home feed, while it's being scrolled. Comparing the event's queryHash
// first keeps a row asleep unless its own query changed.
function subscribeToQuery(
  queryClient: QueryClient,
  queryHash: string,
  onChange: () => void,
): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === queryHash) onChange();
  });
}

// Per-id reactive check: is this track downloaded for the active server? Returns
// a boolean so a row re-renders only when ITS OWN track flips, not when any
// other track is added/removed.
export const useIsTrackAvailableOffline = (trackId: string) =>
  useOffline((s) => trackId in s.downloadedTracks);

// Whether a collection's play affordance can do anything right now: online
// always (the stream is one fetch away), offline only if at least one of its
// tracks is downloaded. Mirrors the guard `playTracks` applies before it
// replaces the queue, so the button reflects what pressing it would do — an
// album whose detail is merely cached stays browsable but can't be played.
export function useHasPlayableTracks(
  songs: Child[] | null | undefined,
): boolean {
  const isOnline = useIsOnline();
  // A boolean, so an online screen never re-renders as downloads land.
  return useOffline(
    useCallback(
      (s) => isOnline || !!songs?.some((song) => song.id in s.downloadedTracks),
      [isOnline, songs],
    ),
  );
}

// Whether a collection/detail row should be ENABLED (tappable). Online — or
// while the persisted cache is still restoring — always enabled (tapping fetches
// & caches). Offline, enabled only if the detail query for `detailKey` is
// already cached, so the destination screen has data. Pass null for rows with no
// cacheable detail (folders/podcasts) to leave them always enabled.
export function useIsDetailCached(detailKey: QueryKey | null): boolean {
  const queryClient = useQueryClient();
  // Online (and while the persisted cache is still restoring) the answer is a
  // constant `true`, so there is nothing in the query cache worth watching —
  // these two drive the re-render on their own when the state flips.
  const isOnline = useIsOnline();
  const isRestoring = useIsCacheRestoring();
  const readsCache = detailKey !== null && !isOnline && !isRestoring;

  // detailKey is a fresh array each render, so identity can't be a dependency.
  // Only hashed on the offline path — this runs on every render of every row.
  const queryHash = readsCache ? hashKey(detailKey) : "";

  const subscribe = useCallback(
    (cb: () => void) =>
      readsCache
        ? subscribeToQuery(queryClient, queryHash, cb)
        : noopUnsubscribe,
    [queryClient, readsCache, queryHash],
  );

  const getSnapshot = useCallback(() => {
    if (!readsCache) return true;
    // By hash rather than getQueryData(detailKey) so the key isn't re-hashed on
    // every read; still "has data", not "has a query" (an errored query has none).
    return queryClient.getQueryCache().get(queryHash)?.state.data !== undefined;
  }, [queryClient, readsCache, queryHash]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

// Pulls the track list for a collection out of the cached detail query, if any.
function songsFromCache(data: unknown, kind: CollectionKind): Child[] | null {
  if (!data || typeof data !== "object") return null;
  if (kind === "album") {
    return (data as { album?: AlbumWithSongsID3 }).album?.song ?? null;
  }
  return (data as { playlist?: PlaylistWithSongs }).playlist?.entry ?? null;
}

function allTracksDownloaded(songs: Child[] | null | undefined): boolean {
  if (!songs || songs.length === 0) return false;
  const { downloadedTracks } = useOffline.getState();
  return songs.every((song) => song.id in downloadedTracks);
}

// Is this collection fully available offline? True when it was explicitly saved
// for offline (in the store) OR its detail is cached AND every track is
// downloaded. The single criterion behind both the downloaded badge on a row
// and the library's "downloaded" filter — reading only one of the two halves
// let a row wear the badge while the filter hid it.
export function isCollectionAvailableOffline(
  queryClient: QueryClient,
  kind: CollectionKind,
  id: string | undefined,
): boolean {
  if (!id) return false;
  if (id in useOffline.getState().downloadedCollections) return true;
  const data = queryClient.getQueryData([kind, id]);
  return allTracksDownloaded(songsFromCache(data, kind));
}

// Reactive wrapper over `isCollectionAvailableOffline`; keeps a row tappable
// offline even when the detail query isn't cached (e.g. after a logout cleared
// the React Query cache). Re-renders when either the query cache or the offline
// store changes.
export function useIsCollectionAvailableOffline(
  kind: CollectionKind,
  id: string | undefined,
): boolean {
  const queryClient = useQueryClient();
  // The result reads exactly one query ([kind, id]) plus the two offline maps,
  // so those are the only things worth waking this row for — not the progress
  // and queue writes a download drain makes several times per track (#205).
  const queryHash = useMemo(() => hashKey([kind, id]), [kind, id]);
  const last = useRef<{
    hash: string;
    collections: unknown;
    tracks: unknown;
    data: unknown;
    value: boolean;
  } | null>(null);

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!id) return noopUnsubscribe;
      const unsubCache = subscribeToQuery(queryClient, queryHash, cb);
      const unsubOffline = useOffline.subscribe((state, prev) => {
        if (
          state.downloadedTracks !== prev.downloadedTracks ||
          state.downloadedCollections !== prev.downloadedCollections
        ) {
          cb();
        }
      });
      return () => {
        unsubCache();
        unsubOffline();
      };
    },
    [queryClient, queryHash, id],
  );

  const getSnapshot = useCallback(() => {
    if (!id) return false;
    const { downloadedTracks, downloadedCollections } = useOffline.getState();
    const data = queryClient.getQueryCache().get(queryHash)?.state.data;
    const prev = last.current;
    if (
      prev &&
      prev.hash === queryHash &&
      prev.collections === downloadedCollections &&
      prev.tracks === downloadedTracks &&
      prev.data === data
    ) {
      return prev.value;
    }
    const value = isCollectionAvailableOffline(queryClient, kind, id);
    last.current = {
      hash: queryHash,
      collections: downloadedCollections,
      tracks: downloadedTracks,
      data,
      value,
    };
    return value;
  }, [queryClient, queryHash, kind, id]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

// Whether any album collection is downloaded — the extended-offline library
// sync registers every server album, so this is what makes the "All albums" /
// "All artists" browse entries reachable offline (their screens fall back to
// the downloaded collections).
export function useHasOfflineAlbumCollections(): boolean {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(
    () =>
      Object.values(downloadedCollections).some(
        (collection) => collection.kind === "album",
      ),
    [downloadedCollections],
  );
}

// Whether ArtistDetail can render this artist offline from downloaded album
// collections (useOfflineArtist) — the fallback that makes artist rows
// tappable without a cached ["artist", id] query.
export function useIsArtistAvailableOffline(
  artistId: string | undefined,
): boolean {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    if (!artistId) return false;
    return Object.values(downloadedCollections).some((collection) =>
      collectionCreditsArtist(collection, artistId),
    );
  }, [artistId, downloadedCollections]);
}
