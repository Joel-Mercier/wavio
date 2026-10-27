import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import {
  flushPendingScopedWrites,
  getNoBackupStorage,
  setPersistedWriteObserver,
} from "@/config/storage";
import {
  cancelAutoBackup,
  isAutoBackupPending,
  isAutoBackupSchedulerAvailable,
  notifyAutoBackupReady,
  onAutoBackupDue,
  reportAutoBackupDone,
  scheduleAutoBackup,
  setAutoBackupPending,
} from "@/modules/auto-backup";
import { isSafListAvailable, listDocuments } from "@/modules/scan-service";
import {
  type BackgroundTimer,
  clearBackgroundTimer,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";
import {
  isBackupExcluded,
  timestampSlug,
  writeBackupFile,
} from "@/services/backup";
import { BACKUP_EXCLUDED_GLOBAL_KEYS } from "@/services/backupStoreKeys";
import { reportError } from "@/services/errorReporting";
import { entryName } from "@/services/offline/downloadDestination";
import { probeWritableTree } from "@/services/writableTree";
import { useAppBase } from "@/stores/app";

// Daily automatic backups (issue #262) into a folder the user picked.
//
// The OS schedules the run (modules/auto-backup: WorkManager on Android), not
// a JS timer, so it fires with the app closed. Persisted state only changes
// while JS runs, so every backed-up write raises a native `pending` flag and a
// run on a day nothing changed finishes natively, without booting JS.
//
// A run never competes with someone using the app: one that comes due while
// the app is in the foreground waits until it is backgrounded (or for
// FOREGROUND_DEFER_CAP_MS), and the file itself is streamed by
// writeBackupFile, a chunk at a time, so the JS thread is never held for long
// even during playback.
//
// Android-only for now: iOS has no persistable folder grant, and the app's
// Documents directory also holds downloads and databases, so it can't be
// exposed to the Files app just for the backups.

const FILE_PREFIX = "wavio-auto-backup-";
const FILE_PATTERN = /^wavio-auto-backup-\d{8}-\d{6}\.json$/;
const FOREGROUND_DEFER_CAP_MS = 30 * 60_000;
// The scheduled run is the normal path; this only catches up when it was
// missed (a force-stopped app loses its scheduled work until the next launch).
const CATCH_UP_AFTER_MS = 26 * 60 * 60_000;

export type AutoBackupError = "folderUnavailable" | "failed";

export type AutoBackupStatus = {
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: AutoBackupError | null;
};

// Device-local and outside every backup: run state written into a backed-up
// store would itself count as a change, so each run would schedule the next.
const STATUS_STORAGE_ID = "autoBackup";
const STATUS_KEY = "status";
const EMPTY_STATUS: AutoBackupStatus = {
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
};

let status: AutoBackupStatus | null = null;
const statusListeners = new Set<() => void>();

function readStatus(): AutoBackupStatus {
  if (status) return status;
  let loaded = EMPTY_STATUS;
  try {
    const raw = getNoBackupStorage(STATUS_STORAGE_ID).getString(STATUS_KEY);
    if (raw) loaded = { ...EMPTY_STATUS, ...JSON.parse(raw) };
  } catch {}
  status = loaded;
  return loaded;
}

function writeStatus(next: AutoBackupStatus) {
  status = next;
  getNoBackupStorage(STATUS_STORAGE_ID).set(STATUS_KEY, JSON.stringify(next));
  for (const listener of statusListeners) listener();
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useAutoBackupStatus(): AutoBackupStatus {
  return useSyncExternalStore(subscribeStatus, readStatus);
}

export const isAutoBackupSupported = (): boolean =>
  Platform.OS === "android" && isAutoBackupSchedulerAvailable();

// --- change tracking -------------------------------------------------------

let pending = false;
// Bumped on every backed-up write, so a write landing while a backup is being
// written keeps `pending` raised for the next one.
let generation = 0;

const isBackedUp = (name: string) =>
  !(BACKUP_EXCLUDED_GLOBAL_KEYS as readonly string[]).includes(name) &&
  !isBackupExcluded(name);

function markPending() {
  generation += 1;
  if (pending) return;
  pending = true;
  setAutoBackupPending(true);
}

// Comparing costs a read of the stored value, so it only happens while it can
// still matter: before the first change since the last backup, or during a run.
function onPersistedWrite(name: string, changesStored: () => boolean) {
  if (!isBackedUp(name)) return;
  if ((!pending || running) && !changesStored()) return;
  markPending();
}

// --- running ---------------------------------------------------------------

let running: Promise<boolean> | null = null;

// `force` is "Back up now": write a file even if nothing changed since the last.
export function runAutoBackup({ force = false } = {}): Promise<boolean> {
  if (!force && !pending) return Promise.resolve(true);
  // Started on a microtask so `running` is set before the run's first write.
  running ??= Promise.resolve()
    .then(performRun)
    .finally(() => {
      running = null;
    });
  return running;
}

async function performRun(): Promise<boolean> {
  const folderUri = useAppBase.getState().autoBackupFolderUri;
  if (!folderUri) return false;
  const attemptAt = Date.now();
  // Lands any throttled write now, so it counts as part of this backup rather
  // than as a change made during it.
  flushPendingScopedWrites();
  const generationAtStart = generation;
  const fileName = `${FILE_PREFIX}${timestampSlug()}.json`;
  const staged = new File(Paths.cache, fileName);
  const folder = new Directory(folderUri);
  try {
    if (!probeWritableTree(folderUri)) {
      writeStatus({
        ...readStatus(),
        lastAttemptAt: attemptAt,
        lastError: "folderUnavailable",
      });
      return false;
    }
    // Staged in the cache and copied in one go: SAF documents can't be
    // renamed, so this is what keeps a half-written file out of the folder.
    await writeBackupFile(staged);
    await staged.copy(folder);
    if (generation === generationAtStart) {
      pending = false;
      setAutoBackupPending(false);
    }
    writeStatus({
      lastSuccessAt: attemptAt,
      lastAttemptAt: attemptAt,
      lastError: null,
    });
    await pruneOldBackups(folderUri);
    return true;
  } catch (error) {
    await removeEntries(folderUri, (name) => name === fileName);
    reportError(error, { area: "storage", endpoint: "autoBackup.run" });
    writeStatus({
      ...readStatus(),
      lastAttemptAt: attemptAt,
      lastError: "failed",
    });
    return false;
  } finally {
    try {
      if (staged.exists) staged.delete();
    } catch {}
  }
}

async function listEntries(
  folderUri: string,
): Promise<{ uri: string; name: string }[]> {
  // The native lister runs off the JS thread: a backup folder can be a busy
  // shared folder, and Directory.list() is a synchronous provider query.
  if (isSafListAvailable()) {
    const records = await listDocuments(folderUri);
    return records
      .filter((record) => !record.isDirectory)
      .map((record) => ({ uri: record.uri, name: entryName(record.uri) }));
  }
  return new Directory(folderUri)
    .list()
    .filter((entry) => entry instanceof File)
    .map((entry) => ({ uri: entry.uri, name: entry.name }));
}

async function removeEntries(
  folderUri: string,
  shouldRemove: (name: string, ownBackups: string[]) => boolean,
) {
  try {
    const entries = await listEntries(folderUri);
    const ownBackups = entries
      .map((entry) => entry.name)
      .filter((name) => FILE_PATTERN.test(name))
      .sort()
      .reverse();
    for (const entry of entries) {
      if (!shouldRemove(entry.name, ownBackups)) continue;
      try {
        new File(entry.uri).delete();
      } catch {}
    }
  } catch (error) {
    reportError(error, { area: "storage", endpoint: "autoBackup.prune" });
  }
}

// Only ever touches this feature's own files, by exact name pattern: the folder
// is the user's, and may hold manual exports or anything else. A lowered keep
// count takes effect at the next backup.
function pruneOldBackups(folderUri: string) {
  const keep = useAppBase.getState().autoBackupKeepCount;
  return removeEntries(folderUri, (name, ownBackups) => {
    if (!FILE_PATTERN.test(name)) return false;
    return ownBackups.indexOf(name) >= keep;
  });
}

// --- scheduling ------------------------------------------------------------

let deferred: { remove: () => void; timer: BackgroundTimer } | null = null;

function cancelDeferred() {
  if (!deferred) return;
  deferred.remove();
  clearBackgroundTimer(deferred.timer);
  deferred = null;
}

function runWhenBackgrounded() {
  if (deferred) return;
  const run = () => {
    cancelDeferred();
    void runAutoBackup();
  };
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "background") run();
  });
  deferred = {
    remove: () => sub.remove(),
    timer: setBackgroundTimeout(run, FOREGROUND_DEFER_CAP_MS),
  };
}

// Native waits on reportAutoBackupDone (5 min cap on Android), so a deferred
// run is answered at once and carries on in this process, which is alive
// anyway: the app is in the foreground.
async function handleDue() {
  try {
    if (!isActive(useAppBase.getState())) return;
    if (AppState.currentState === "active") {
      runWhenBackgrounded();
      return;
    }
    await runAutoBackup();
  } finally {
    reportAutoBackupDone();
  }
}

type AutoBackupSettings = {
  autoBackupEnabled: boolean;
  autoBackupMinuteOfDay: number;
  autoBackupFolderUri: string | null;
};

const isActive = (settings: AutoBackupSettings) =>
  settings.autoBackupEnabled && settings.autoBackupFolderUri !== null;

function applySettings(
  next: AutoBackupSettings,
  previous: AutoBackupSettings | null,
) {
  if (!isActive(next)) {
    setPersistedWriteObserver(null);
    cancelDeferred();
    cancelAutoBackup();
    return;
  }
  if (!previous || !isActive(previous)) {
    pending = isAutoBackupPending();
    setPersistedWriteObserver(onPersistedWrite);
  }
  // A newly enabled schedule or a different folder has nothing in it yet.
  if (
    previous &&
    (!isActive(previous) ||
      previous.autoBackupFolderUri !== next.autoBackupFolderUri)
  ) {
    markPending();
  }
  const minuteOfDay = next.autoBackupMinuteOfDay;
  scheduleAutoBackup(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
}

export function startAutoBackupScheduler(): void {
  if (!isAutoBackupSupported()) return;
  onAutoBackupDue(() => {
    void handleDue();
  });
  const initial = useAppBase.getState();
  applySettings(initial, null);
  useAppBase.subscribe((state, previous) => {
    if (
      state.autoBackupEnabled !== previous.autoBackupEnabled ||
      state.autoBackupMinuteOfDay !== previous.autoBackupMinuteOfDay ||
      state.autoBackupFolderUri !== previous.autoBackupFolderUri
    ) {
      applySettings(state, previous);
    }
  });
  // Only on a launch someone sees: a background launch is either the scheduled
  // run itself, whose `due` is on its way, or a car or media button, where a
  // backup is nobody's priority.
  const { lastSuccessAt } = readStatus();
  if (
    AppState.currentState === "active" &&
    isActive(initial) &&
    pending &&
    (lastSuccessAt === null || Date.now() - lastSuccessAt > CATCH_UP_AFTER_MS)
  ) {
    runWhenBackgrounded();
  }
  notifyAutoBackupReady();
}
