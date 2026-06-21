import {
  addJukebox,
  clearJukebox,
  setGainJukebox,
  setJukebox,
  skipJukebox,
  startJukebox,
  statusJukebox,
  stopJukebox,
} from "@/services/backend/jukebox";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";

type ActivateOptions = {
  position: number;
  autoplay: boolean;
};

let lastKnownQueueIds: string[] | null = null;
let queueUnsub: (() => void) | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;

function readQueueIds(): string[] {
  return useQueue.getState().queue.map((t) => t.id);
}

function currentIndex(): number {
  return useQueue.getState().currentIndex ?? 0;
}

async function refreshStatus() {
  try {
    const rsp = await statusJukebox();
    const status = (rsp as { jukeboxStatus?: unknown }).jukeboxStatus as
      | import("@/services/openSubsonic/types").JukeboxStatus
      | undefined;
    if (status) {
      useJukebox.getState().setStatus(status);
      // The server auto-advances through the playlist on its own; reconcile the
      // local queue index to the server's so the UI doesn't show a stale track.
      const local = useQueue.getState().currentIndex ?? 0;
      if (
        typeof status.currentIndex === "number" &&
        status.currentIndex !== local
      ) {
        useQueue.getState().setCurrentIndex(status.currentIndex);
      }
    }
  } catch {
    // Transient errors should not bounce the user out of jukebox mode.
  }
}

function startPolling(intervalMs: number) {
  stopPolling();
  pollHandle = setInterval(refreshStatus, intervalMs);
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

function subscribeQueue() {
  if (queueUnsub) return;
  lastKnownQueueIds = readQueueIds();
  queueUnsub = useQueue.subscribe((state) => {
    if (!useJukebox.getState().active) return;
    const ids = state.queue.map((t) => t.id);
    const prev = lastKnownQueueIds ?? [];
    const changed =
      ids.length !== prev.length || ids.some((id, i) => id !== prev[i]);
    if (!changed) return;
    lastKnownQueueIds = ids;
    if (ids.length === 0) {
      clearJukebox().catch(() => {});
      return;
    }
    setJukebox(ids).catch(() => {});
  });
}

function unsubscribeQueue() {
  queueUnsub?.();
  queueUnsub = null;
  lastKnownQueueIds = null;
}

export async function activate(opts: ActivateOptions): Promise<void> {
  const ids = readQueueIds();
  const idx = currentIndex();
  const gain = useJukebox.getState().gain;
  await clearJukebox();
  if (ids.length > 0) await setJukebox(ids);
  await setGainJukebox(gain);
  if (ids.length > 0) {
    await skipJukebox(idx, Math.max(0, Math.floor(opts.position)));
  }
  if (opts.autoplay && ids.length > 0) await startJukebox();
  useJukebox.getState().setActive(true);
  await refreshStatus();
  subscribeQueue();
  startPolling(3000);
}

export async function deactivate(): Promise<{ position: number }> {
  const lastPosition = useJukebox.getState().status?.position ?? 0;
  try {
    await stopJukebox();
  } catch {
    // Ignore — local takeover should always succeed even if the server is
    // unreachable.
  }
  useJukebox.getState().setActive(false);
  useJukebox.getState().setStatus(null);
  unsubscribeQueue();
  stopPolling();
  return { position: lastPosition };
}

export function isActive(): boolean {
  return useJukebox.getState().active;
}

export async function jukeboxPlay() {
  await startJukebox();
  await refreshStatus();
}

export async function jukeboxPause() {
  await stopJukebox();
  await refreshStatus();
}

export async function jukeboxTogglePlayPause() {
  const playing = useJukebox.getState().status?.playing ?? false;
  if (playing) await jukeboxPause();
  else await jukeboxPlay();
}

export async function jukeboxSkipNext() {
  const q = useQueue.getState();
  q.next();
  const idx = q.currentIndex ?? 0;
  await skipJukebox(idx, 0);
  await refreshStatus();
}

export async function jukeboxSkipPrevious() {
  const q = useQueue.getState();
  q.previous();
  const idx = q.currentIndex ?? 0;
  await skipJukebox(idx, 0);
  await refreshStatus();
}

export async function jukeboxSeekTo(seconds: number) {
  const idx = currentIndex();
  await skipJukebox(idx, Math.max(0, Math.floor(seconds)));
  await refreshStatus();
}

export function jukeboxGetCurrentTime(): number {
  return useJukebox.getState().status?.position ?? 0;
}

export function jukeboxIsPlaying(): boolean {
  return useJukebox.getState().status?.playing ?? false;
}

export async function jukeboxSetGain(gain: number) {
  const clamped = Math.max(0, Math.min(1, gain));
  useJukebox.getState().setGain(clamped);
  await setGainJukebox(clamped);
  await refreshStatus();
}

export async function jukeboxAdd(ids: string[]) {
  if (ids.length === 0) return;
  await addJukebox(ids);
  await refreshStatus();
}

export { refreshStatus as jukeboxRefreshStatus };
