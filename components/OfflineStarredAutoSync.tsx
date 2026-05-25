import { useEffect } from "react";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useIsOnline } from "@/hooks/useIsOnline";
import { offlineDownloadService } from "@/services/offlineDownloadService";
import useOffline from "@/stores/offline";

// Mounted once at the app root. Auto-downloads any newly-starred tracks when
// offline mode is on. Previously this effect lived inside useOfflineDownloads,
// which meant every list item that used the hook ran the effect — fanning out
// the work and rescheduling it on every starred2 refetch.
//
// The offline store is scoped per (server, user), so "already downloaded"
// naturally only counts for the active server.
export default function OfflineStarredAutoSync() {
  const isOnline = useIsOnline();
  const offlineModeEnabled = useOffline((s) => s.offlineModeEnabled);
  const { data: starredTracksData } = useStarred2(
    {},
    { enabled: isOnline && offlineModeEnabled },
  );
  const starredSongs = starredTracksData?.starred2?.song;

  useEffect(() => {
    if (!isOnline || !offlineModeEnabled || !starredSongs?.length) return;
    const { isTrackDownloaded } = useOffline.getState();
    const tracksToDownload = starredSongs.filter(
      (track) => !isTrackDownloaded(track.id),
    );
    if (tracksToDownload.length === 0) return;
    console.log(
      `Download Manager: Auto-downloading ${tracksToDownload.length} starred tracks`,
    );
    offlineDownloadService
      .downloadAllStarredTracks(tracksToDownload)
      .catch((error) => {
        console.error(
          "Download Manager: Error auto-downloading starred tracks:",
          error,
        );
      });
  }, [isOnline, offlineModeEnabled, starredSongs]);

  return null;
}
