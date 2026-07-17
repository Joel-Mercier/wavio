import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getIsCacheRestoring,
  subscribeCacheRestoring,
} from "@/config/queryClient";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
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

// Per-id reactive check: is this track downloaded for the active server? Returns
// a boolean so a row re-renders only when ITS OWN track flips, not when any
// other track is added/removed.
export const useIsTrackAvailableOffline = (trackId: string) =>
  useOffline((s) => trackId in s.downloadedTracks);

// Whether a collection/detail row should be ENABLED (tappable). Online — or
// while the persisted cache is still restoring — always enabled (tapping fetches
// & caches). Offline, enabled only if the detail query for `detailKey` is
// already cached, so the destination screen has data. Pass null for rows with no
// cacheable detail (folders/podcasts) to leave them always enabled.
export function useIsDetailCached(detailKey: QueryKey | null): boolean {
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

// Reactive: is this collection fully available offline? True when it was
// explicitly saved for offline (in the store) OR its detail is cached AND every
// track is downloaded. Drives the downloaded badge on list rows and keeps the
// row tappable offline even when the detail query isn't cached (e.g. after a
// logout cleared the React Query cache). Re-renders when either the query cache
// or the offline store changes.
export function useIsCollectionAvailableOffline(
  kind: CollectionKind,
  id: string | undefined,
): boolean {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (cb: () => void) => {
      const unsubCache = queryClient.getQueryCache().subscribe(cb);
      const unsubOffline = useOffline.subscribe(cb);
      return () => {
        unsubCache();
        unsubOffline();
      };
    },
    [queryClient],
  );

  const getSnapshot = useCallback(() => {
    if (!id) return false;
    if (id in useOffline.getState().downloadedCollections) return true;
    const data = queryClient.getQueryData([kind, id]);
    return allTracksDownloaded(songsFromCache(data, kind));
  }, [queryClient, kind, id]);

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
