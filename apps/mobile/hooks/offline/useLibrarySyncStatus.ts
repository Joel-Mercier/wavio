import { useSyncExternalStore } from "react";
import {
  useDownloadedTracksCount,
  useTotalDownloadSize,
} from "@/hooks/offline/useDownloads";
import { useConnectionType, useIsOnline } from "@/hooks/useIsOnline";
import {
  getArtworkProgress,
  subscribePendingArtwork,
} from "@/services/offline/librarySyncService";
import useApp from "@/stores/app";
import useLibrarySync from "@/stores/librarySync";
import useOffline from "@/stores/offline";

export type LibrarySyncUiStatus =
  | "off"
  | "syncing"
  | "cachingArtwork"
  | "pausedOffline"
  | "pausedWifi"
  | "pausedDisk"
  | "syncError"
  | "unsupported"
  | "upToDate";

// Settings-row view of the extended-offline library sync: one status to
// render, plus the aggregate progress numbers. Subscribes to the whole
// downloaded-tracks map — fine for the settings screen, not for list items.
export function useLibrarySyncStatus() {
  const enabled = useLibrarySync((s) => s.extendedOfflineModeEnabled);
  const phase = useLibrarySync((s) => s.phase);
  const lastError = useLibrarySync((s) => s.lastError);
  const totalSongs = useLibrarySync((s) => s.totalSongs);
  const downloadedCount = useDownloadedTracksCount();
  const size = useTotalDownloadSize();
  const queueLength = useOffline((s) => s.downloadQueue.length);
  // Artwork downloads trail the crawl, and a library without its covers isn't
  // really cached — going offline in that window is what leaves rows on their
  // fallback icons.
  const artwork = useSyncExternalStore(
    subscribePendingArtwork,
    getArtworkProgress,
    getArtworkProgress,
  );
  const isOnline = useIsOnline();
  const connectionType = useConnectionType();
  const downloadsWifiOnly = useApp((s) => s.downloadsWifiOnly);

  let status: LibrarySyncUiStatus;
  if (!enabled) {
    status = "off";
  } else if (lastError === "unsupported") {
    status = "unsupported";
  } else if (phase === "complete" && queueLength === 0 && !artwork.pending) {
    status = "upToDate";
  } else if (phase === "complete" && queueLength === 0) {
    // Tracks are all on disk but covers are still coming down. Called out
    // separately so it's obvious the library isn't fully usable offline yet —
    // "up to date" while artwork trailed is what made rows fall back to their
    // icons after going offline.
    status = "cachingArtwork";
  } else if (!isOnline) {
    status = "pausedOffline";
  } else if (downloadsWifiOnly && connectionType !== "wifi") {
    status = "pausedWifi";
  } else if (lastError === "diskFull") {
    status = "pausedDisk";
  } else if (lastError === "syncFailed") {
    status = "syncError";
  } else {
    status = "syncing";
  }

  // The denominator settles as the albums phase discovers songCounts; never
  // show more downloaded than total.
  const total = Math.max(totalSongs, downloadedCount);
  const progress = total > 0 ? Math.min(1, downloadedCount / total) : 0;

  const artworkDone = artwork.total - artwork.pending;

  return {
    enabled,
    status,
    downloadedCount,
    total,
    size,
    progress,
    artworkDone,
    artworkTotal: artwork.total,
    artworkPending: artwork.pending,
  };
}
