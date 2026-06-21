import { useMemo } from "react";
import {
  offlineCollectionToAlbum,
  offlineCollectionToPlaylist,
} from "@/services/offline";
import type {
  AlbumWithSongsID3,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

// Offline fallbacks for the playlist/album detail screens. They reconstruct the
// Subsonic envelope from the active scope's offline store so a downloaded
// collection stays browsable/playable even when the server query has no data
// (offline + persisted React Query cache cleared by a logout). Reactive over the
// store so the rows update as the download queue drains.

export function useOfflinePlaylist(
  id: string | undefined,
): { playlist: PlaylistWithSongs } | undefined {
  const collection = useOffline((s) =>
    id ? s.downloadedCollections[id] : undefined,
  );
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    if (collection?.kind !== "playlist") return undefined;
    return {
      playlist: offlineCollectionToPlaylist(collection, downloadedTracks),
    };
  }, [collection, downloadedTracks]);
}

export function useOfflineAlbum(
  id: string | undefined,
): { album: AlbumWithSongsID3 } | undefined {
  const collection = useOffline((s) =>
    id ? s.downloadedCollections[id] : undefined,
  );
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    if (collection?.kind !== "album") return undefined;
    return { album: offlineCollectionToAlbum(collection, downloadedTracks) };
  }, [collection, downloadedTracks]);
}
