import { useCallback, useMemo } from "react";
import { offlineDownloadService } from "@/services/offline";
import type { Child } from "@/services/openSubsonic/types";
import type { OfflineTrack } from "@/stores/offline";
import useOffline from "@/stores/offline";
import { logError } from "@/utils/log";

// Download state + actions for the active (server, user) scope. The store is
// scoped per scope via createDynamicScopedStorage, so everything here belongs to
// the signed-in server.
//
// Prefer the narrow selector hooks below in list items — subscribing to the
// whole store (e.g. via the aggregate useOfflineDownloads) re-renders every
// consumer on each setDownloadProgress tick, which fans out to hundreds of rows
// during an active download.

// Aggregate manager hook for screens/providers that need several actions at
// once (settings + track lookups + download/remove actions). NOT for list items.
export const useOfflineDownloads = () => {
  const offlineModeEnabled = useOffline((s) => s.offlineModeEnabled);
  const setOfflineModeEnabled = useOffline((s) => s.setOfflineModeEnabled);
  const downloadedTracks = useOffline((s) => s.downloadedTracks);

  const isTrackDownloaded = useCallback(
    (trackId: string) => trackId in downloadedTracks,
    [downloadedTracks],
  );

  const getDownloadedTrack = useCallback(
    (trackId: string): OfflineTrack | null => downloadedTracks[trackId] ?? null,
    [downloadedTracks],
  );

  const downloadTrack = useCallback(async (track: Child) => {
    try {
      await offlineDownloadService.downloadTrack(track);
    } catch (error) {
      logError("Download Manager: Error downloading track:", error);
      throw error;
    }
  }, []);

  const downloadTracks = useCallback(async (tracks: Child[]) => {
    try {
      await offlineDownloadService.downloadTracks(tracks);
    } catch (error) {
      logError("Download Manager: Error downloading tracks:", error);
      throw error;
    }
  }, []);

  const removeDownloadedTrack = useCallback(async (trackId: string) => {
    try {
      await offlineDownloadService.removeDownloadedTrack(trackId);
    } catch (error) {
      logError("Download Manager: Error removing downloaded track:", error);
      throw error;
    }
  }, []);

  const clearAllDownloads = useCallback(async () => {
    try {
      await offlineDownloadService.clearAllDownloads();
    } catch (error) {
      logError("Download Manager: Error clearing all downloads:", error);
      throw error;
    }
  }, []);

  const clearFailedDownloads = useCallback(() => {
    useOffline.getState().clearFailedDownloads();
  }, []);

  // Read live state via the service (which reads useOffline.getState). NOT
  // reactive — callers that need to re-render on progress changes should use
  // useDownloadProgress(trackId) instead.
  const getDownloadProgress = useCallback((trackId: string) => {
    return offlineDownloadService.getDownloadProgress(trackId);
  }, []);

  const isTrackDownloading = useCallback((trackId: string) => {
    return offlineDownloadService.isTrackDownloading(trackId);
  }, []);

  return {
    offlineModeEnabled,
    setOfflineModeEnabled,
    downloadedTracks,
    isTrackDownloaded,
    getDownloadedTrack,
    getDownloadProgress,
    isTrackDownloading,
    downloadTrack,
    downloadTracks,
    removeDownloadedTrack,
    clearAllDownloads,
    clearFailedDownloads,
  };
};

// Narrow boolean subscription for the offline-mode toggle — use this in list
// items so a row doesn't also subscribe to downloadedTracks.
export const useOfflineModeEnabled = () =>
  useOffline((s) => s.offlineModeEnabled);

// Reactive view of the downloaded-tracks list (changes on add/remove/clear —
// not progress ticks).
export const useDownloadedTracksList = () => {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return Object.values(downloadedTracks);
};

export const useDownloadedTracksCount = () =>
  useOffline((s) => Object.keys(s.downloadedTracks).length);

// Reactive view of saved offline collections (playlists/albums). Selects the
// map (stable ref) and derives the list in the hook body so it only changes
// when a collection is added/removed.
export const useDownloadedCollections = () => {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(
    () => Object.values(downloadedCollections),
    [downloadedCollections],
  );
};

export const useTotalDownloadSize = () =>
  useOffline((s) =>
    Object.values(s.downloadedTracks).reduce((sum, t) => sum + t.size, 0),
  );

// Per-id reactive progress — scoped to one trackId so a row only re-renders when
// its own progress changes.
export const useDownloadProgress = (trackId: string) =>
  useOffline((s) => s.downloadProgress[trackId] ?? null);
