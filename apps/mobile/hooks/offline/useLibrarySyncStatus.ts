import { useConnectionType, useIsOnline } from "@/hooks/useIsOnline";
import useApp from "@/stores/app";
import useLibrarySync from "@/stores/librarySync";
import useOffline from "@/stores/offline";

export type LibrarySyncUiStatus =
  | "off"
  | "syncing"
  | "pausedOffline"
  | "pausedWifi"
  | "pausedDisk"
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
  const downloadedCount = useOffline(
    (s) => Object.keys(s.downloadedTracks).length,
  );
  const size = useOffline((s) =>
    Object.values(s.downloadedTracks).reduce((sum, t) => sum + t.size, 0),
  );
  const queueLength = useOffline((s) => s.downloadQueue.length);
  const isOnline = useIsOnline();
  const connectionType = useConnectionType();
  const downloadsWifiOnly = useApp((s) => s.downloadsWifiOnly);

  let status: LibrarySyncUiStatus;
  if (!enabled) {
    status = "off";
  } else if (lastError === "unsupported") {
    status = "unsupported";
  } else if (phase === "complete" && queueLength === 0) {
    status = "upToDate";
  } else if (!isOnline) {
    status = "pausedOffline";
  } else if (downloadsWifiOnly && connectionType !== "wifi") {
    status = "pausedWifi";
  } else if (lastError === "diskFull") {
    status = "pausedDisk";
  } else {
    status = "syncing";
  }

  // The denominator settles as the albums phase discovers songCounts; never
  // show more downloaded than total.
  const total = Math.max(totalSongs, downloadedCount);
  const progress = total > 0 ? Math.min(1, downloadedCount / total) : 0;

  return { enabled, status, downloadedCount, total, size, progress };
}
