import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type {
  AlbumWithSongsID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

type CollectionKind = "album" | "playlist";

// Pulls the track list for a collection out of the cached detail query, if it
// has been loaded. Returns null when the detail isn't cached (we can't know the
// track set, so the caller should treat it as "not fully downloaded").
function songsFromCache(data: unknown, kind: CollectionKind): Child[] | null {
  if (!data || typeof data !== "object") return null;
  if (kind === "album") {
    const album = (data as { album?: AlbumWithSongsID3 }).album;
    return album?.song ?? null;
  }
  const playlist = (data as { playlist?: PlaylistWithSongs }).playlist;
  return playlist?.entry ?? null;
}

export function allTracksDownloaded(
  songs: Child[] | null | undefined,
): boolean {
  if (!songs || songs.length === 0) return false;
  const { downloadedTracks } = useOffline.getState();
  return songs.every((song) => song.id in downloadedTracks);
}

// Reactive: true only when the collection's detail is cached AND every one of
// its tracks is in Wavio's offline downloads. Re-renders when either the query
// cache or the downloaded-tracks map changes. Used to show the downloaded badge
// on album/playlist list items without having the track list loaded locally.
export function useIsCollectionDownloaded(
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
    const data = queryClient.getQueryData([kind, id]);
    const songs = songsFromCache(data, kind);
    return allTracksDownloaded(songs);
  }, [queryClient, kind, id]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
