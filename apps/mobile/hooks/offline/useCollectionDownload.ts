import { useCallback, useMemo } from "react";
import { offlineDownloadService } from "@/services/offline";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

export type CollectionDownloadStatus =
  | "none" // nothing downloaded yet
  | "downloading" // at least one track in flight
  | "partial" // some (but not all) downloaded, none in flight
  | "all"; // every track downloaded

// Metadata persisted alongside the downloaded tracks so the collection can be
// listed (and reopened) in the Library while offline, even when the server list
// query isn't cached. Omit it for ad-hoc multi-track downloads that aren't a
// browsable collection.
export type DownloadCollectionMeta = {
  id: string;
  kind: "playlist" | "album";
  name: string;
  coverArt?: string;
  owner?: string;
  artist?: string;
  artistId?: string;
  year?: number;
};

// Drives the "Save for offline listening" / "Remove downloads" action on album
// and playlist detail sheets, plus the header badge. Reactive over the offline
// store so the row label and badge update as the queue drains. When `meta` is
// provided, the collection is also persisted so it shows up in the offline
// Library.
export function useCollectionDownload(
  songs: Child[] | undefined,
  meta?: DownloadCollectionMeta,
) {
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
    if (meta) {
      useOffline.getState().addDownloadedCollection({
        ...meta,
        trackIds: songs.map((song) => song.id),
        songCount: songs.length,
        savedAt: new Date().toISOString(),
      });
    }
  }, [songs, downloadedTracks, meta]);

  const removeAll = useCallback(async () => {
    if (meta) {
      offlineDownloadService.removeCollection(
        meta.id,
        songs?.map((song) => song.id) ?? [],
      );
      return;
    }
    if (!songs?.length) return;
    for (const song of songs) {
      if (song.id in downloadedTracks) {
        offlineDownloadService.removeDownloadedTrack(song.id);
      }
    }
  }, [songs, downloadedTracks, meta]);

  return { total, downloadedCount, status, saveAll, removeAll };
}
