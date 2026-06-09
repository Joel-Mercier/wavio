import {
  createScanController,
  type ScanController,
  scanLibrary,
} from "@/services/local/indexer";
import { localFolders } from "@/services/local/paths";
import { localEnvelope } from "@/services/local/unsupported";
import type { ScanStatus } from "@/services/openSubsonic/types";
import useLocalLibrary from "@/stores/localLibrary";
import { logError } from "@/utils/log";

// `startScan` / `getScanStatus` map the Subsonic library-scan endpoints onto the
// on-device indexer (services/local/indexer.ts). A scan runs in the background
// and streams progress into the local-library store; `getScanStatus` reports it.

// Throttle store writes so a fast folder doesn't thrash subscribers.
const PROGRESS_INTERVAL_MS = 150;

let controller: ScanController | null = null;

export const startScan = async () => {
  // Subsonic's startScan is fire-and-forget: kick the scan off and return the
  // scanning state immediately. A second call while one is running is a no-op.
  if (!controller) {
    const folders = localFolders();
    const { setStatus, setScanFinished } = useLocalLibrary.getState();
    if (folders.length > 0) {
      controller = createScanController();
      setStatus({ phase: "listing", processed: 0, total: 0 });
      let lastEmit = 0;
      void (async () => {
        try {
          const result = await scanLibrary(folders, {
            controller: controller ?? undefined,
            onProgress: (p) => {
              const now = Date.now();
              if (
                p.phase === "indexing" &&
                p.processed > 0 &&
                now - lastEmit < PROGRESS_INTERVAL_MS
              ) {
                return;
              }
              lastEmit = now;
              setStatus({
                phase: p.phase,
                processed: p.processed,
                total: p.total,
                currentFile: p.currentFile,
              });
            },
          });
          setScanFinished(result);
        } catch (error) {
          logError("[local] Scan failed", error);
          setStatus({
            phase: "idle",
            processed: 0,
            total: 0,
            error: String(error),
          });
        } finally {
          controller = null;
        }
      })();
    }
  }
  const scanStatus: ScanStatus = { scanning: true };
  return localEnvelope({ scanStatus });
};

export const getScanStatus = async () => {
  const { status } = useLocalLibrary.getState();
  const scanning = status.phase !== "idle";
  const scanStatus: ScanStatus = {
    scanning,
    count: scanning ? status.processed : undefined,
  };
  return localEnvelope({ scanStatus });
};

/** Stop an in-flight scan (e.g. when leaving local mode). */
export const cancelScan = (): void => {
  controller?.cancel();
};
