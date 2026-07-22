import { useEffect, useRef } from "react";
import { useLidarrQueue } from "@/hooks/lidarr/useLidarrDownloads";
import { useCanStartScan } from "@/hooks/useCanStartScan";
import { startScan } from "@/services/backend/mediaLibraryScanning";
import { detectFinishedQueueItems } from "@/services/lidarr/queue";
import useLidarr from "@/stores/lidarr";
import { logError } from "@/utils/log";

// Mounted once at the app root. Drives the single queue poll and, when a
// download disappears from the queue (finished), triggers a server library scan
// so the fetched album surfaces in the app — without the user opening the
// downloads screen. Gated on the autoScanOnComplete setting.
export default function LidarrDownloadsWatcher() {
  const isConnected = useLidarr((s) => s.isConnected);
  const autoScanOnComplete = useLidarr((s) => s.autoScanOnComplete);
  const canStartScan = useCanStartScan();
  const { data } = useLidarrQueue();
  const previousRef = useRef<NonNullable<typeof data>>([]);

  useEffect(() => {
    if (!data) return;
    const finished = detectFinishedQueueItems(previousRef.current, data);
    previousRef.current = data;
    if (
      finished.length > 0 &&
      isConnected &&
      autoScanOnComplete &&
      canStartScan
    ) {
      startScan().catch((error) =>
        logError("[lidarr] auto scan failed", error),
      );
    }
  }, [data, isConnected, autoScanOnComplete, canStartScan]);

  return null;
}
