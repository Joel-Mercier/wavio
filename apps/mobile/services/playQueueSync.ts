import { getNoBackupStorage } from "@/config/storage";
import { getPlayQueue, savePlayQueue } from "@/services/backend/bookmarks";
import { getCapabilities } from "@/services/backend/capabilities";
import {
  type BackgroundTimer,
  clearBackgroundTimer,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  getCurrentTime,
  isPlaying,
  restoreServerQueue,
} from "@/services/player";
import { useAppBase } from "@/stores/app";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useJukebox from "@/stores/jukebox";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { isLibraryTrack } from "@/utils/trackSource";

const PUSH_DEBOUNCE_MS = 5_000;
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;

let pushTimer: BackgroundTimer | null = null;
let started = false;
let unsubscribeQueue: (() => void) | null = null;
let unsubscribeOnline: (() => void) | null = null;
// A change the server hasn't been told about yet, typically made offline (a car
// out of the server's reach). Pushed as soon as it is reachable again.
let pushPending = false;
let retryDelay = RETRY_MIN_MS;
let lastSignature: string | null = null;
// Bumped by every stop, so work started for a scope that has since been left
// (an in-flight restore or push) can tell and stand down.
let generation = 0;

// When this device's queue last changed and how much of that the server has, on
// the device's own clock, per scope. A queue changed past what was synced (one
// played in a car out of the server's reach, then the app killed before it got
// back) outlives the process, so the next launch can tell it is newer than the
// server's instead of replacing it. Outside backups: it describes this device.
type SyncLedger = { changedAt: number; syncedAt: number };

const ledgerStorage = () => getNoBackupStorage("playQueueSync");

function readLedger(): SyncLedger {
  try {
    const raw = ledgerStorage().getString(currentAuthScope());
    if (raw) return JSON.parse(raw) as SyncLedger;
  } catch {}
  return { changedAt: 0, syncedAt: 0 };
}

function writeLedger(next: SyncLedger): void {
  try {
    ledgerStorage().set(currentAuthScope(), JSON.stringify(next));
  } catch {}
}

const hasUnsyncedChanges = () => {
  const { changedAt, syncedAt } = readLedger();
  return changedAt > syncedAt;
};

const markSynced = (changedAt: number) => {
  const ledger = readLedger();
  if (changedAt > ledger.syncedAt)
    writeLedger({ ...ledger, syncedAt: changedAt });
};

// What the server stores of a queue. A rehydrate re-parses an identical queue
// into new arrays, which must not count as a change.
const signatureOf = (queue: QueueTrack[], currentIndex: number | null) =>
  `${currentIndex}|${queue.map((t) => t.id).join(",")}`;

const queueSignature = () => {
  const { queue, currentIndex } = useQueue.getState();
  return signatureOf(queue, currentIndex);
};

// Stamped whether sync is running or not, so a change made before it starts (or
// while it is off) still counts. Restoring the stored queue is not a change: it
// lands while the store reports not hydrated, and becomes the baseline.
let stampedSignature: string | null = null;
useQueue.subscribe((next, prev) => {
  if (next.queue === prev.queue && next.currentIndex === prev.currentIndex) {
    return;
  }
  const signature = signatureOf(next.queue, next.currentIndex);
  if (!useQueue.persist.hasHydrated()) {
    stampedSignature = signature;
    return;
  }
  if (signature === stampedSignature) return;
  stampedSignature = signature;
  writeLedger({ ...readLedger(), changedAt: Date.now() });
});

// Navidrome sends nanoseconds, which not every Date parser accepts.
function parseServerTime(value: unknown): number | null {
  if (value == null) return null;
  const time = Date.parse(String(value).replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(time) ? null : time;
}

function syncEnabled(): boolean {
  if (getCapabilities(useAuthBase.getState().serverType).playQueueSync) {
    return useAppBase.getState().queueSyncPriority !== "off";
  }
  return false;
}

// Whether it's safe to write right now. Jukebox owns server-side playback, so
// the local queue isn't authoritative there; offline writes would just fail.
// Reads network.ts rather than React Query's onlineManager, which only follows
// connectivity once app/_layout.tsx has mounted: a headless car boot never does.
function canPush(): boolean {
  if (!syncEnabled()) return false;
  if (useJukebox.getState().active) return false;
  return getIsEffectivelyOnline();
}

function setPushTimer(ms: number): void {
  if (pushTimer) clearBackgroundTimer(pushTimer);
  pushTimer = setBackgroundTimeout(() => {
    pushTimer = null;
    void doPush();
  }, ms);
}

async function doPush(): Promise<void> {
  if (!canPush()) return;
  pushPending = false;
  const { queue, currentIndex } = useQueue.getState();
  if (queue.length === 0) return;
  // Radio stations, podcast episodes and audiobooks aren't library tracks;
  // skip them rather than uploading ids the server can't resolve.
  const ids = queue.filter(isLibraryTrack).map((t) => t.id);
  if (ids.length === 0) return;
  const current =
    currentIndex != null ? (queue[currentIndex]?.id ?? undefined) : undefined;
  if (current && !ids.includes(current)) return;
  const position = getCurrentTime();
  const run = generation;
  const { changedAt } = readLedger();
  try {
    await savePlayQueue({ ids, current, position });
    retryDelay = RETRY_MIN_MS;
    if (run === generation) markSynced(changedAt);
  } catch {
    if (run !== generation) return;
    pushPending = true;
    // Retried on a backoff as well as on reconnecting: a request can fail
    // without anything probing the server, so reachability may never change.
    if (started && !pushTimer) {
      setPushTimer(retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    }
  }
}

function schedulePush(): void {
  if (syncEnabled()) pushPending = true;
  if (!canPush()) return;
  setPushTimer(PUSH_DEBOUNCE_MS);
}

// Force an immediate push, cancelling any pending debounce. Used when the app
// goes to the background so the latest queue/position is persisted promptly.
export function flushPlayQueue(): void {
  if (syncEnabled()) pushPending = true;
  if (pushTimer) {
    clearBackgroundTimer(pushTimer);
    pushTimer = null;
  }
  void doPush();
}

// Pull the server queue and replace the local one (without auto-playing). Only
// meaningful when priority is "server". Stands down when something was played
// while the request was out: the car can start playback from a headless boot
// before the server answers, and replacing that queue would stop the music. It
// also keeps a local queue changed after the server's last save that never
// reached it: the most recent of the two wins. Only that case compares the two
// clocks; a queue that was synced is already on the server.
export async function restorePlayQueueFromServer(): Promise<boolean> {
  if (!syncEnabled()) return false;
  if (!getIsEffectivelyOnline()) return false;
  const run = generation;
  const before = queueSignature();
  try {
    const rsp = await getPlayQueue();
    if (run !== generation) return false;
    if (isPlaying() || queueSignature() !== before) return false;
    const entries = rsp.playQueue?.entry ?? [];
    if (entries.length === 0) return false;
    const ledger = readLedger();
    const serverChanged = parseServerTime(rsp.playQueue?.changed);
    if (
      ledger.changedAt > ledger.syncedAt &&
      serverChanged != null &&
      ledger.changedAt > serverChanged
    ) {
      return false;
    }
    const tracks = entries.map((child) => childToTrack(child));
    const current = rsp.playQueue?.current;
    let index = 0;
    if (current != null) {
      // Subsonic reports `current` as the playing track id; Navidrome may send
      // a numeric index. Prefer an id match, fall back to a valid index.
      const byId = tracks.findIndex((t) => t.id === String(current));
      if (byId >= 0) index = byId;
      else if (
        typeof current === "number" &&
        current >= 0 &&
        current < tracks.length
      )
        index = current;
    }
    restoreServerQueue(tracks, index, rsp.playQueue?.position ?? 0);
    // The queue now matches the server's, whatever was stamped restoring it.
    markSynced(readLedger().changedAt);
    return true;
  } catch {
    // Ignore — fall back to the locally persisted queue.
    return false;
  }
}

// Wire up periodic pushes and perform the initial restore. Call once after the
// queue store has hydrated.
export async function initPlayQueueSync(): Promise<void> {
  if (started) return;
  started = true;
  const run = generation;

  // Jukebox owns the queue server-side; restoring the saved play queue here
  // would overwrite the live jukebox playlist (sourced via getJukebox instead).
  const before = queueSignature();
  const restored =
    useAppBase.getState().queueSyncPriority === "server" &&
    !useJukebox.getState().active &&
    (await restorePlayQueueFromServer());
  // Stopped while the restore was out (a sign-out or a server switch).
  if (run !== generation) return;

  lastSignature = queueSignature();
  unsubscribeQueue = useQueue.subscribe((next, prev) => {
    if (next.queue === prev.queue && next.currentIndex === prev.currentIndex) {
      return;
    }
    const signature = queueSignature();
    if (signature === lastSignature) return;
    lastSignature = signature;
    schedulePush();
  });
  unsubscribeOnline = subscribeEffectiveOnline(() => {
    if (pushPending && getIsEffectivelyOnline()) schedulePush();
  });
  // Played or changed while the restore was out (a car play), before the
  // subscription above existed to see it, or changed in an earlier run without
  // reaching the server: that queue is the one that counts now.
  if (
    !restored &&
    (isPlaying() || lastSignature !== before || hasUnsyncedChanges())
  ) {
    schedulePush();
  }
}

export function stopPlayQueueSync(): void {
  if (pushTimer) {
    clearBackgroundTimer(pushTimer);
    pushTimer = null;
  }
  unsubscribeQueue?.();
  unsubscribeQueue = null;
  unsubscribeOnline?.();
  unsubscribeOnline = null;
  pushPending = false;
  retryDelay = RETRY_MIN_MS;
  lastSignature = null;
  generation++;
  started = false;
}
