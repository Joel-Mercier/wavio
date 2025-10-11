import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { offlineDownloadService } from "@/services/offlineDownloadService";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

export const useOfflineDownloads = () => {
  const queryClient = useQueryClient();
  const offlineStore = useOffline();
  const { data: starredTracksData } = useStarred2({});

  // Auto-download starred tracks when offline mode is enabled
  useEffect(() => {
    const downloadStarredTracks = async () => {
      if (
        offlineStore.offlineModeEnabled &&
        starredTracksData?.starred2?.song &&
        starredTracksData.starred2.song.length > 0
      ) {
        const starredTracks = starredTracksData.starred2.song;
        const tracksToDownload = starredTracks.filter(
          (track) => !offlineStore.isTrackDownloaded(track.id),
        );

        if (tracksToDownload.length > 0) {
          console.log(
            `Download Manager: Auto-downloading ${tracksToDownload.length} starred tracks`,
          );
          try {
            await offlineDownloadService.downloadAllStarredTracks(
              tracksToDownload,
            );
          } catch (error) {
            console.error(
              "Download Manager: Error auto-downloading starred tracks:",
              error,
            );
          }
        }
      }
    };

    downloadStarredTracks();
  }, [offlineStore.offlineModeEnabled, starredTracksData?.starred2?.song]);

  const downloadTrack = useCallback(async (track: Child) => {
    try {
      await offlineDownloadService.downloadTrack(track);
    } catch (error) {
      console.error("Download Manager: Error downloading track:", error);
      throw error;
    }
  }, []);

  const downloadTracks = useCallback(async (tracks: Child[]) => {
    try {
      await offlineDownloadService.downloadTracks(tracks);
    } catch (error) {
      console.error("Download Manager: Error downloading tracks:", error);
      throw error;
    }
  }, []);

  const removeDownloadedTrack = useCallback(async (trackId: string) => {
    try {
      await offlineDownloadService.removeDownloadedTrack(trackId);
    } catch (error) {
      console.error(
        "Download Manager: Error removing downloaded track:",
        error,
      );
      throw error;
    }
  }, []);

  const clearAllDownloads = useCallback(async () => {
    try {
      await offlineDownloadService.clearAllDownloads();
    } catch (error) {
      console.error("Download Manager: Error clearing all downloads:", error);
      throw error;
    }
  }, []);

  const pauseAllDownloads = useCallback(() => {
    offlineDownloadService.pauseAllDownloads();
  }, []);

  const getDownloadProgress = useCallback((trackId: string) => {
    return offlineDownloadService.getDownloadProgress(trackId);
  }, []);

  const isTrackDownloading = useCallback((trackId: string) => {
    return offlineDownloadService.isTrackDownloading(trackId);
  }, []);

  return {
    // Settings
    offlineModeEnabled: offlineStore.offlineModeEnabled,
    setOfflineModeEnabled: offlineStore.setOfflineModeEnabled,

    // Downloaded tracks
    downloadedTracks: offlineStore.downloadedTracks,
    downloadedTracksList: offlineStore.getDownloadedTracksList(),
    isTrackDownloaded: offlineStore.isTrackDownloaded,
    getDownloadedTrack: offlineStore.getDownloadedTrack,
    getTotalDownloadSize: offlineStore.getTotalDownloadSize,
    getDownloadedTracksCount: offlineStore.getDownloadedTracksCount,

    // Download progress
    downloadProgress: offlineStore.downloadProgress,
    getDownloadProgress,
    isTrackDownloading,

    // Download queue
    downloadQueue: offlineStore.downloadQueue,

    // Actions
    downloadTrack,
    downloadTracks,
    removeDownloadedTrack,
    clearAllDownloads,
    pauseAllDownloads,
  };
};
