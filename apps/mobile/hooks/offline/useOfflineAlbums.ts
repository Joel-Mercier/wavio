import { useMemo } from "react";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

// Offline fallback for the "All albums" browse: the album list the extended-
// offline library sync registered as collections, in the same alphabetical
// order the server's albumList2 browse uses. `enabled: false` short-circuits
// the derivation so the list isn't rebuilt on every store write while fresh
// server data is present.
export function useOfflineAlbums(enabled = true): AlbumID3[] | undefined {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    if (!enabled) return undefined;
    const albums = Object.values(downloadedCollections)
      .filter((collection) => collection.kind === "album")
      .map(
        (collection): AlbumID3 => ({
          id: collection.id,
          name: collection.name,
          artist: collection.artist,
          artistId: collection.artistId,
          year: collection.year,
          coverArt: collection.coverArt,
          songCount: collection.songCount,
          duration: 0,
          created: new Date(collection.savedAt),
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return albums.length > 0 ? albums : undefined;
  }, [enabled, downloadedCollections]);
}
