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
  type ScanResult,
  scanLibrary,
} from "@/services/local/indexer";
import { localFolders } from "@/services/local/paths";
import { localEnvelope } from "@/services/local/unsupported";
import { getConnectionType, getIsEffectivelyOnline } from "@/services/network";
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

// A scan started in the background has no UI of its own to invalidate caches or
// say anything when it finishes — only the first-login gate does, and it does it
// on unmount. This is how a listener finds out the index changed.
type ScanCompletedListener = (result: ScanResult) => void;
const scanCompletedListeners = new Set<ScanCompletedListener>();

export function subscribeScanCompleted(cb: ScanCompletedListener): () => void {
  scanCompletedListeners.add(cb);
  return () => {
    scanCompletedListeners.delete(cb);
  };
}

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

export const startScan = async (force = false, silent = false) => {
  // Subsonic's startScan is fire-and-forget: kick the scan off and return the
  // scanning state immediately. A second call while one is running is a no-op.
  // `force` re-extracts every file (used by an explicit "rescan" so new tag
  // fields land on already-indexed files the incremental scan would skip).
  // `silent` marks a scan nobody asked for, which suppresses the partial-scan
  // warning — see setScanFinished.
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
    if (folders.length === 0) {
      // Same reasoning as the metered guard: a caller that gets `scanning: true`
      // for a scan that never starts either spins forever (the gate) or reports
      // success (settings "sync now").
      setStatus({
        phase: "idle",
        processed: 0,
        total: 0,
        errorCode: "ERR_SCAN_NO_FOLDERS",
      });
      return localEnvelope({ scanStatus: { scanning: false } as ScanStatus });
    }
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
        const { albumArtNames, artistArtNames } = useAppBase.getState();
        const result = await scanLibrary(folders, {
          controller: controller ?? undefined,
          force,
          // Read here rather than inside the walk so one scan uses one list,
          // whatever the user edits while it runs.
          albumArtNames,
          artistArtNames,
          onProgress: (p) => {
            const now = Date.now();
            // The listing phase is throttled too: the walk lists directories
            // concurrently, so a batch of 25 can land every few tens of ms and
            // would otherwise write to the store dozens of times a second.
            // Dropping the last listing tick is harmless — the phase flips to
            // `indexing` right after, and that emit isn't throttled at
            // `processed === 0`.
            if (
              (p.phase === "listing" ||
                (p.phase === "indexing" && p.processed > 0)) &&
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
        setScanFinished(result, silent);
        for (const listener of scanCompletedListeners) listener(result);
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
  silent = false,
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
    return startScan(force, silent);
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
// anything that later wants to close or delete it. The automatic-scan
// bookkeeping below belongs to that session too: carried into the next one it
// would suppress the incoming library's first sync on someone else's timestamp.
registerLogoutHandler(() => {
  cancelScan();
  __resetAutoScanThrottle();
});

/** True while a scan is running, so callers don't stack another on top. */
export const isScanning = (): boolean => controller !== null;

// A failed scan never stamps `lastScanAt`, so the staleness test below would let
// an unreachable share retry on every single foreground. Ephemeral on purpose: a
// cold start is a good enough reason to try again.
let lastAutoScanAt = 0;

// Whether this launch already tried to finish a partial library. Only consulted
// when auto-sync is off — see `maybeAutoScan`.
let resumedThisLaunch = false;

/**
 * Re-walk the library by itself when it's worth doing.
 *
 * Two cases, both of which want the same non-forced scan:
 *
 *  - **The last scan didn't finish seeing the whole library.** It has no cursor
 *    — it dies with the JS context — but it doesn't need one: rows already
 *    written are skipped by the incremental `(uri, size, mtime)` check, so a
 *    re-run costs one listing pass plus only the files still missing. What it
 *    does need is to actually happen, because an incomplete scan is otherwise
 *    invisible (the prune guard means nothing disappears, so the library just
 *    quietly stays partial). Runs with auto-sync off too, but then only once per
 *    launch: a share with one permanently unreadable folder is incomplete
 *    forever, and re-walking it on every timer tick is exactly what the user
 *    turned off.
 *  - **The library is simply out of date.** Files added or removed on a share
 *    are otherwise never noticed. Same incremental scan, so a sync that finds
 *    nothing costs one listing per folder and no file reads at all.
 *
 * Never forced: forcing re-extracts everything already indexed, which is the
 * opposite of what either case wants. Never routed through `requestRescan`
 * either — that clears `lastScanAt` and re-opens the full-screen indexing gate,
 * and nothing the user didn't ask for should take over the app.
 */
export const maybeAutoScan = (): void => {
  // Called on every foreground, whatever the active server, so bail early for a
  // backend that has no on-device index. `localFolders()` would return nothing
  // for those anyway, but relying on that means this reads as if it might scan a
  // Navidrome server.
  if (!isIndexBackedType(useAuthBase.getState().serverType)) return;
  if (isScanning()) return;
  const { lastScanAt, lastScanResult, ready } = useLocalLibrary.getState();
  if (!ready) return;
  // An on-device library has no server to reach; for a share this is the
  // difference between a cheap no-op and a walk that fails every folder and
  // comes back marked incomplete.
  if (activeFileSource().kind !== "device" && !getIsEffectivelyOnline()) return;
  if (scanBlockedByMeteredNetwork()) return;
  const { autoLibrarySync, autoLibrarySyncIntervalMinutes } =
    useAppBase.getState();
  const interval = autoLibrarySyncIntervalMinutes * 60_000;
  const now = Date.now();
  // The attempt stamp is checked whatever the reason to scan, including a resume
  // — a library with one permanently unreadable folder is incomplete forever, and
  // that used to mean re-walking the whole share on every single foreground.
  // Because the stamp starts at zero, a cold start still retries straight away.
  if (now - lastAutoScanAt < interval) return;
  const resuming = lastScanResult?.incomplete === true;
  if (resuming) {
    if (!autoLibrarySync && resumedThisLaunch) return;
  } else {
    if (!autoLibrarySync) return;
    // A library that has never been scanned belongs to the gate, not here.
    if (lastScanAt === undefined) return;
    if (now - lastScanAt < interval) return;
  }
  lastAutoScanAt = now;
  resumedThisLaunch = resumedThisLaunch || resuming;
  void startScan(false, true);
};

/** Forget the automatic-scan bookkeeping (sign-out, and a test seam). */
export const __resetAutoScanThrottle = (): void => {
  lastAutoScanAt = 0;
  resumedThisLaunch = false;
};
