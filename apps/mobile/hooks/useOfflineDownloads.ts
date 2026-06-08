import { useCallback } from "react";
import { offlineDownloadService } from "@/services/offlineDownloadService";
import type { Child } from "@/services/openSubsonic/types";
import type { OfflineTrack } from "@/stores/offline";
import useOffline from "@/stores/offline";
import { logError } from "@/utils/log";

// Narrow selectors only. Subscribing to the entire store would re-render every
// consumer on each `setDownloadProgress` tick, and this hook is called from
// list items (TrackListItem / LibraryListItem) where that fans out to hundreds
// of components during an active download.
//
// The progress / queue records are only subscribed where they're actually
// rendered — see useDownloadProgress / useDownloadQueue below.
//
// The store itself is scoped per (server, user) via createDynamicScopedStorage,
// so the data here naturally belongs to the active server.
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

  // These read live state via the service (which reads from useOffline.getState).
  // They are NOT reactive — callers that need to re-render on progress changes
  // should use useDownloadProgress(trackId) instead.
  const getDownloadProgress = useCallback((trackId: string) => {
    return offlineDownloadService.getDownloadProgress(trackId);
  }, []);

  const isTrackDownloading = useCallback((trackId: string) => {
    return offlineDownloadService.isTrackDownloading(trackId);
  }, []);

  return {
    // Settings
    offlineModeEnabled,
    setOfflineModeEnabled,

    // Downloaded tracks
    downloadedTracks,
    isTrackDownloaded,
    getDownloadedTrack,

    // Download progress (non-reactive helpers; subscribe via the hooks below)
    getDownloadProgress,
    isTrackDownloading,

    // Actions
    downloadTrack,
    downloadTracks,
    removeDownloadedTrack,
    clearAllDownloads,
    clearFailedDownloads,
  };
};

// Narrow boolean subscription for the offline-mode toggle. Use this in list
// items instead of useOfflineDownloads() so a row doesn't also subscribe to the
// downloadedTracks map (which re-renders every row on any add/remove).
export const useOfflineModeEnabled = () =>
  useOffline((s) => s.offlineModeEnabled);

// Per-id reactive downloaded check. The selector returns a boolean, so a row
// re-renders only when ITS OWN track's download status flips — not when any
// other track is added or removed. Prefer this over
// useOfflineDownloads().isTrackDownloaded in list items, which subscribes to the
// whole downloadedTracks map.
export const useIsTrackDownloaded = (trackId: string) =>
  useOffline((s) => trackId in s.downloadedTracks);

// Reactive view of the downloaded-tracks list for the active server. Subscribes
// to downloadedTracks only (changes on add/remove/clear — not progress ticks).
export const useDownloadedTracksList = () => {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return Object.values(downloadedTracks);
};

export const useDownloadedTracksCount = () =>
  useOffline((s) => Object.keys(s.downloadedTracks).length);

export const useTotalDownloadSize = () =>
  useOffline((s) =>
    Object.values(s.downloadedTracks).reduce((sum, t) => sum + t.size, 0),
  );

// Reactive subscriptions for progress UIs. Scope progress access to a single
// trackId so a row only re-renders when its own progress changes.
export const useDownloadProgress = (trackId: string) =>
  useOffline((s) => s.downloadProgress[trackId] ?? null);

export const useAllDownloadProgress = () =>
  useOffline((s) => s.downloadProgress);

export const useDownloadQueue = () => useOffline((s) => s.downloadQueue);
