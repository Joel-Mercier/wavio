import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DeleteProgress,
  librarySyncService,
  offlineDownloadService,
} from "@/services/offline";
import { downloadedFileIsOnPrimaryVolume } from "@/services/offline/downloadDestination";
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

async function removeDownloadedTrack(trackId: string) {
  try {
    await offlineDownloadService.removeDownloadedTrack(trackId);
  } catch (error) {
    logError("Download Manager: Error removing downloaded track:", error);
    throw error;
  }
}

async function clearAllDownloads(onProgress?: DeleteProgress) {
  try {
    await offlineDownloadService.clearAllDownloads(onProgress);
    // The downloaded state (and cached artwork) is gone; a still-enabled
    // library sync restarts its crawl from scratch.
    librarySyncService.handleDownloadsCleared();
  } catch (error) {
    logError("Download Manager: Error clearing all downloads:", error);
    throw error;
  }
}

// The remove actions alone, for a screen that must not subscribe to the store.
export const useDownloadActions = () => ({
  removeDownloadedTrack,
  clearAllDownloads,
});

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

const SETTLE_MS = 2000;

// The downloaded-tracks map for a screen that lists every download: while the
// queue drains, completions are held until they stop arriving for SETTLE_MS or
// the queue empties. Every completion replaces the map, and re-sorting ~20k rows
// on each one kept the JS thread busy enough to stall the drain itself (issue
// #205). A removal is never held, so a deleted row can't linger on screen, and a
// drain that parks (offline, disk full) still catches up.
export const useSettledDownloadedTracks = () => {
  const [tracks, setTracks] = useState(
    () => useOffline.getState().downloadedTracks,
  );
  useEffect(() => {
    let shown = useOffline.getState().downloadedTracks;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const show = (next: typeof shown) => {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (next === shown) return;
      shown = next;
      setTracks(next);
    };
    setTracks(shown);
    const unsubscribe = useOffline.subscribe((state, prev) => {
      const next = state.downloadedTracks;
      if (next === shown) return;
      if (state.downloadQueue.length === 0) return show(next);
      if (next === prev.downloadedTracks) return;
      if (
        Object.keys(next).length < Object.keys(prev.downloadedTracks).length
      ) {
        return show(next);
      }
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(
        () => show(useOffline.getState().downloadedTracks),
        SETTLE_MS,
      );
    });
    return () => {
      unsubscribe();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);
  return tracks;
};

export const useDownloadQueueLength = () =>
  useOffline((s) => s.downloadQueue.length);

// For callers that only care whether anything is downloaded: the selector
// returns a boolean, so completions don't re-render them the way a count would
// (issue #205 — the whole Library list re-sorted on every finished track).
export const useHasDownloadedTracks = () =>
  useOffline((s) => {
    for (const _ in s.downloadedTracks) return true;
    return false;
  });

// Selects the (referentially stable) map and derives in useMemo so the O(n)
// work re-runs only when a track is added/removed — not on every store write
// (progress ticks land several times a second during an active sync).
export const useDownloadedTracksCount = () => {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(
    () => Object.keys(downloadedTracks).length,
    [downloadedTracks],
  );
};

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

export const useTotalDownloadSize = () => {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(
    () => Object.values(downloadedTracks).reduce((sum, t) => sum + t.size, 0),
    [downloadedTracks],
  );
};

// Downloaded bytes split by whether they sit on the volume `Paths` measures.
// Read from each record's path, not from the download-location setting: that
// setting only governs new downloads, so a library can straddle both and the
// setting says nothing about where the existing files are.
export const useDownloadSizeByVolume = () => {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    let onVolume = 0;
    let offVolume = 0;
    for (const track of Object.values(downloadedTracks)) {
      if (downloadedFileIsOnPrimaryVolume(track.path)) onVolume += track.size;
      else offVolume += track.size;
    }
    return { onVolume, offVolume };
  }, [downloadedTracks]);
};

// Per-id reactive progress — scoped to one trackId so a row only re-renders when
// its own progress changes.
export const useDownloadProgress = (trackId: string) =>
  useOffline((s) => s.downloadProgress[trackId] ?? null);
