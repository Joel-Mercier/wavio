import { useMemo } from "react";
import useOffline from "@/stores/offline";

export function useAutoDownloadCollectionCount(kind: "album" | "playlist") {
  return useOffline((s) => {
    let count = 0;
    for (const collection of Object.values(s.downloadedCollections)) {
      if (collection.source === "rule" && collection.kind === kind) count++;
    }
    return count;
  });
}

export function useLikedSongsDownloadStatus() {
  const likedSongIds = useOffline((s) => s.likedSongIds);
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    let done = 0;
    let size = 0;
    for (const id of likedSongIds ?? []) {
      const track = downloadedTracks[id];
      if (!track) continue;
      done++;
      size += track.size;
    }
    return {
      known: likedSongIds !== null,
      count: likedSongIds?.length ?? 0,
      done,
      size,
    };
  }, [likedSongIds, downloadedTracks]);
}
