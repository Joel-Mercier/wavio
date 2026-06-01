import { useCallback, useMemo } from "react";
import { offlineDownloadService } from "@/services/offlineDownloadService";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

export type CollectionDownloadStatus =
  | "none" // nothing downloaded yet
  | "downloading" // at least one track in flight
  | "partial" // some (but not all) downloaded, none in flight
  | "all"; // every track downloaded

// Drives the "Save for offline listening" / "Remove downloads" action on album
// and playlist detail sheets, plus the header badge. Reactive over the offline
// store so the row label and badge update as the queue drains.
export function useCollectionDownload(songs: Child[] | undefined) {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  const downloadProgress = useOffline((s) => s.downloadProgress);

  const { total, downloadedCount, status } = useMemo(() => {
    const ids = songs?.map((song) => song.id) ?? [];
    const total = ids.length;
    const downloadedCount = ids.filter((id) => id in downloadedTracks).length;
    const downloadingCount = ids.filter((id) => {
      const progress = downloadProgress[id];
      return (
        progress?.status === "downloading" || progress?.status === "pending"
      );
    }).length;

    let status: CollectionDownloadStatus = "none";
    if (total > 0 && downloadedCount === total) status = "all";
    else if (downloadingCount > 0) status = "downloading";
    else if (downloadedCount > 0) status = "partial";

    return { total, downloadedCount, status };
  }, [songs, downloadedTracks, downloadProgress]);

  const saveAll = useCallback(async () => {
    if (!songs?.length) return;
    const pending = songs.filter((song) => !(song.id in downloadedTracks));
    await offlineDownloadService.downloadTracks(pending);
  }, [songs, downloadedTracks]);

  const removeAll = useCallback(async () => {
    if (!songs?.length) return;
    for (const song of songs) {
      if (song.id in downloadedTracks) {
        offlineDownloadService.removeDownloadedTrack(song.id);
      }
    }
  }, [songs, downloadedTracks]);

  return { total, downloadedCount, status, saveAll, removeAll };
}
