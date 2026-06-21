import { onlineManager } from "@tanstack/react-query";
import { getPlayQueue, savePlayQueue } from "@/services/backend/bookmarks";
import { getCapabilities } from "@/services/backend/capabilities";
import { restoreServerQueue } from "@/services/player";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";

const PUSH_DEBOUNCE_MS = 5_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let unsubscribeQueue: (() => void) | null = null;

function syncEnabled(): boolean {
  if (getCapabilities(useAuthBase.getState().serverType).playQueueSync) {
    return useAppBase.getState().queueSyncPriority !== "off";
  }
  return false;
}

// Whether it's safe to write right now. Jukebox owns server-side playback, so
// the local queue isn't authoritative there; offline writes would just fail.
function canPush(): boolean {
  if (!syncEnabled()) return false;
  if (useJukebox.getState().active) return false;
  if (!onlineManager.isOnline()) return false;
  return true;
}

async function doPush(): Promise<void> {
  if (!canPush()) return;
  const { queue, currentIndex } = useQueue.getState();
  if (queue.length === 0) return;
  // Internet radio entries aren't real library tracks; skip queues built from
  // them rather than uploading ids the server can't resolve.
  const ids = queue.filter((t) => !t.isRadio).map((t) => t.id);
  if (ids.length === 0) return;
  const current =
    currentIndex != null ? (queue[currentIndex]?.id ?? undefined) : undefined;
  // Lazy import avoids a static import cycle (player -> playQueueSync -> player).
  const { getCurrentTime } = await import("@/services/player");
  const position = getCurrentTime();
  try {
    await savePlayQueue({ ids, current, position });
  } catch {
    // Best-effort; the next change reschedules a push.
  }
}

function schedulePush(): void {
  if (!canPush()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void doPush();
  }, PUSH_DEBOUNCE_MS);
}

// Force an immediate push, cancelling any pending debounce. Used when the app
// goes to the background so the latest queue/position is persisted promptly.
export function flushPlayQueue(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  void doPush();
}

// Pull the server queue and replace the local one (without auto-playing). Only
// meaningful when priority is "server".
export async function restorePlayQueueFromServer(): Promise<void> {
  if (!syncEnabled()) return;
  if (!onlineManager.isOnline()) return;
  try {
    const rsp = await getPlayQueue();
    const entries = rsp.playQueue?.entry ?? [];
    if (entries.length === 0) return;
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
  } catch {
    // Ignore — fall back to the locally persisted queue.
  }
}

// Wire up periodic pushes and perform the initial restore. Call once after the
// queue store has hydrated.
export async function initPlayQueueSync(): Promise<void> {
  if (started) return;
  started = true;

  // Jukebox owns the queue server-side; restoring the saved play queue here
  // would overwrite the live jukebox playlist (sourced via getJukebox instead).
  if (
    useAppBase.getState().queueSyncPriority === "server" &&
    !useJukebox.getState().active
  ) {
    await restorePlayQueueFromServer();
  }

  unsubscribeQueue = useQueue.subscribe((next, prev) => {
    if (next.queue !== prev.queue || next.currentIndex !== prev.currentIndex) {
      schedulePush();
    }
  });
}

export function stopPlayQueueSync(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  unsubscribeQueue?.();
  unsubscribeQueue = null;
  started = false;
}
