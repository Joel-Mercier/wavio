import { useEffect, useRef } from "react";
import { useTidarrQueue } from "@/hooks/tidarr/useTidarrDownloads";
import { useCanStartScan } from "@/hooks/useCanStartScan";
import { startScan } from "@/services/backend/mediaLibraryScanning";
import { detectFinishedQueueItems } from "@/services/tidarr/queue";
import useTidarr from "@/stores/tidarr";
import { logError } from "@/utils/log";

// Mounted once at the app root. Drives the single queue poll and, when a
// download reaches `finished`, triggers a server library scan so the fetched
// album surfaces in the app — without the user opening the downloads screen.
// Gated on the autoScanOnComplete setting.
export default function TidarrDownloadsWatcher() {
  const isConnected = useTidarr((store) => store.isConnected);
  const autoScanOnComplete = useTidarr((store) => store.autoScanOnComplete);
  const canStartScan = useCanStartScan();
  const { data } = useTidarrQueue();
  const previousRef = useRef<NonNullable<typeof data>>([]);

  useEffect(() => {
    // No queue to compare against — the instance was disconnected, or a server
    // switch cleared the query cache. Dropping the snapshot keeps the previous
    // scope's in-flight items from being diffed against the next one's queue.
    if (!isConnected || !data) {
      previousRef.current = [];
      return;
    }
    const finished = detectFinishedQueueItems(previousRef.current, data);
    previousRef.current = data;
    if (finished.length > 0 && autoScanOnComplete && canStartScan) {
      startScan().catch((error) =>
        logError("[tidarr] auto scan failed", error),
      );
    }
  }, [data, isConnected, autoScanOnComplete, canStartScan]);

  return null;
}
