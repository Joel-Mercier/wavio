import i18n from "@/config/i18n";
import { startScanService, stopScanService } from "@/modules/scan-service";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import { activeFileSource } from "@/services/fileSource";
import { fileSourceErrorCode } from "@/services/fileSource/errors";
import { getLocalLibraryDb } from "@/services/local/db";
import {
  createScanController,
  deleteTracksByFolders,
  type ScanController,
  scanLibrary,
} from "@/services/local/indexer";
import { localFolders } from "@/services/local/paths";
import { localEnvelope } from "@/services/local/unsupported";
import { getConnectionType } from "@/services/network";
import type { ScanStatus } from "@/services/openSubsonic/types";
import { useAppBase } from "@/stores/app";
import { registerLogoutHandler, useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import { logError } from "@/utils/log";

// `startScan` / `getScanStatus` map the Subsonic library-scan endpoints onto the
// on-device indexer (services/local/indexer.ts). A scan runs in the background
// and streams progress into the local-library store; `getScanStatus` reports it.

// Throttle store writes so a fast folder doesn't thrash subscribers.
const PROGRESS_INTERVAL_MS = 150;

let controller: ScanController | null = null;

/**
 * Whether a scan may run right now.
 *
 * A network file share's first scan reads the tag region of every file on the
 * share; on a large library that is a lot of metered data, and unlike playback
 * it is not something the user asked for at that moment. The on-device library
 * reads no network at all, so the guard never applies to it.
 */
export function scanBlockedByMeteredNetwork(): boolean {
  if (activeFileSource().kind === "device") return false;
  if (!useAppBase.getState().scanOnWifiOnly) return false;
  return getConnectionType() === "cellular";
}

export const startScan = async (force = false) => {
  // Subsonic's startScan is fire-and-forget: kick the scan off and return the
  // scanning state immediately. A second call while one is running is a no-op.
  // `force` re-extracts every file (used by an explicit "rescan" so new tag
  // fields land on already-indexed files the incremental scan would skip).
  if (!controller) {
    const folders = localFolders();
    const { setStatus, setScanFinished } = useLocalLibrary.getState();
    if (scanBlockedByMeteredNetwork()) {
      // Reported as an error rather than swallowed: the indexing gate blocks on
      // a scan finishing, so a silent no-op would leave the user on a spinner
      // with nothing to act on.
      setStatus({
        phase: "idle",
        processed: 0,
        total: 0,
        errorCode: "ERR_SCAN_METERED_NETWORK",
      });
      return localEnvelope({ scanStatus: { scanning: false } as ScanStatus });
    }
    if (folders.length > 0) {
      controller = createScanController();
      setStatus({ phase: "listing", processed: 0, total: 0 });
      // Android only, and best-effort: holds the process for the duration so
      // backgrounding a long first scan doesn't kill it partway.
      //
      // Only for a source that reads across a network, which is what makes a
      // scan long enough to outlive a backgrounding — the same split
      // `scanBlockedByMeteredNetwork` draws. An on-device rescan is local reads
      // with no round trips, so posting an ongoing notification for one is all
      // cost and no guarantee. `stopScanService` below stays unconditional:
      // stopping a service that was never started is a no-op, and that also
      // covers a source switch mid-scan.
      if (activeFileSource().kind !== "device") {
        startScanService(
          i18n.t("app.localIndexing.title"),
          i18n.t("app.localIndexing.notificationText"),
        );
      }
      let lastEmit = 0;
      void (async () => {
        try {
          const result = await scanLibrary(folders, {
            controller: controller ?? undefined,
            force,
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
                directories: p.directories,
              });
            },
          });
          setScanFinished(result);
        } catch (error) {
          logError("[local] Scan failed", error);
          const code = fileSourceErrorCode(error);
          setStatus({
            phase: "idle",
            processed: 0,
            total: 0,
            errorCode: code ?? "ERR_SCAN_FAILED",
            // Only carried when we couldn't classify it, so the gate has
            // something concrete to show under the generic message.
            errorDetail: code ? undefined : String(error),
          });
        } finally {
          controller = null;
          stopScanService();
        }
      })();
    }
  }
  const scanStatus: ScanStatus = { scanning: true };
  return localEnvelope({ scanStatus });
};

/**
 * Reconcile the index with the configured source folders, then scan. Folders no
 * longer configured have their tracks deleted directly (by `source_folder`);
 * `startScan` then indexes added/changed files under the remaining folders. This
 * is the gate's entry point so both a folder change and a first login funnel
 * through the same path. `force` re-extracts every file (settings "rescan").
 */
let reconcileInFlight: Promise<Awaited<ReturnType<typeof startScan>>> | null =
  null;

export const runLibraryReconcileScan = (
  force = false,
): Promise<Awaited<ReturnType<typeof startScan>>> => {
  // The first-login gate can mount twice (see LocalLibraryIndexing), firing two
  // concurrent reconciles that each open a `deleteTracksByFolders` transaction
  // on the same shared SQLite handle — a second BEGIN throws "cannot start a
  // transaction within a transaction". Coalesce overlapping calls onto one run,
  // the same way `startScan` self-guards its scan.
  if (reconcileInFlight) return reconcileInFlight;
  const run = (async () => {
    try {
      const configured = new Set(localFolders());
      const db = await getLocalLibraryDb();
      const rows = await db.getAllAsync<{ source_folder: string | null }>(
        "SELECT DISTINCT source_folder FROM tracks WHERE source_folder IS NOT NULL",
      );
      const removed = rows
        .map((r) => r.source_folder as string)
        .filter((folder) => !configured.has(folder));
      await deleteTracksByFolders(db, removed);
    } catch (error) {
      logError("[local] Failed to reconcile removed folders", error);
    }
    return startScan(force);
  })();
  reconcileInFlight = run;
  void run.finally(() => {
    if (reconcileInFlight === run) reconcileInFlight = null;
  });
  return run;
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

// A scan belongs to the session that started it. Left running across a sign-out
// it keeps reading the share and writing the departed scope's index — pure waste
// on a network file source, and it holds that scope's SQLite handle open against
// anything that later wants to close or delete it.
registerLogoutHandler(cancelScan);

/** True while a scan is running, so callers don't stack another on top. */
export const isScanning = (): boolean => controller !== null;

/**
 * Re-run a scan that didn't finish seeing the whole library.
 *
 * The scan has no cursor — it dies with the JS context — but it doesn't need
 * one: rows already written are skipped by the incremental `(uri, size, mtime)`
 * check, so a re-run costs one listing pass plus only the files still missing.
 * What it does need is to actually happen, because an incomplete scan is
 * otherwise invisible (the prune guard means nothing disappears, so the library
 * just quietly stays partial).
 *
 * Deliberately not forced: forcing would re-extract everything already indexed,
 * which is the opposite of what a resume wants.
 */
export const resumeIncompleteScan = (): void => {
  // Called on every foreground, whatever the active server, so bail early for a
  // backend that has no on-device index. `localFolders()` would return nothing
  // for those anyway, but relying on that means this reads as if it might scan a
  // Navidrome server.
  if (!isIndexBackedType(useAuthBase.getState().serverType)) return;
  if (isScanning()) return;
  const { lastScanResult, ready } = useLocalLibrary.getState();
  if (!ready || !lastScanResult?.incomplete) return;
  if (scanBlockedByMeteredNetwork()) return;
  void startScan(false);
};
