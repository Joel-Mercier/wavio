import {
  addJukebox,
  clearJukebox,
  getJukebox,
  setGainJukebox,
  setJukebox,
  skipJukebox,
  startJukebox,
  statusJukebox,
  stopJukebox,
} from "@/services/backend/jukebox";
import type {
  JukeboxPlaylist,
  JukeboxStatus,
} from "@/services/openSubsonic/types";
import { restoreServerQueue, takeOverFromJukebox } from "@/services/player";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { logError } from "@/utils/log";

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

function clampIndex(index: number | undefined, length: number): number {
  if (typeof index !== "number" || length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

async function refreshStatus() {
  try {
    const rsp = await statusJukebox();
    const status = (rsp as { jukeboxStatus?: JukeboxStatus }).jukeboxStatus;
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

// Pull the authoritative playlist from the server (another device may have
// added/reordered tracks) and mirror it locally. Cheap when nothing changed:
// only rebuilds the queue when the server's id list differs from ours.
async function reconcileFromServer() {
  let playlist: JukeboxPlaylist | undefined;
  try {
    const rsp = await getJukebox();
    playlist = (rsp as { jukeboxPlaylist?: JukeboxPlaylist }).jukeboxPlaylist;
  } catch {
    return;
  }
  if (!playlist) return;
  try {
    applyServerPlaylist(playlist);
  } catch (error) {
    logError(error);
  }
}

function applyServerPlaylist(playlist: JukeboxPlaylist) {
  useJukebox.getState().setStatus({
    currentIndex: playlist.currentIndex,
    gain: playlist.gain,
    playing: playlist.playing,
    position: playlist.position,
  });

  const serverIds = (playlist.entry ?? []).map((e) => e.id);
  const localIds = readQueueIds();
  const sameOrder =
    serverIds.length === localIds.length &&
    serverIds.every((id, i) => id === localIds[i]);

  if (sameOrder) {
    const local = useQueue.getState().currentIndex ?? 0;
    if (
      typeof playlist.currentIndex === "number" &&
      playlist.currentIndex !== local
    ) {
      useQueue.getState().setCurrentIndex(playlist.currentIndex);
    }
    return;
  }

  if (serverIds.length === 0) {
    // Track our snapshot first so the queue subscription doesn't echo the clear
    // back to the server.
    lastKnownQueueIds = [];
    useQueue.getState().clearQueue();
    return;
  }

  const tracks = (playlist.entry ?? []).map((entry) => childToTrack(entry));
  const idx = clampIndex(playlist.currentIndex, tracks.length);
  // Set before mutating the queue so subscribeQueue sees no change and skips
  // pushing the just-pulled playlist straight back to the server.
  lastKnownQueueIds = serverIds;
  restoreServerQueue(tracks, idx, playlist.position ?? 0);
}

function startPolling(intervalMs: number) {
  stopPolling();
  pollHandle = setInterval(reconcileFromServer, intervalMs);
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

// Re-establish a jukebox session after an app restart: the server keeps playing
// while `active` was persisted true, but polling and the queue subscription
// only live for the lifetime of the JS runtime. Pulls the live playlist and
// resumes observation without re-issuing `set` (which would reset the server).
export async function reattach(): Promise<void> {
  if (!useJukebox.getState().active) return;
  await reconcileFromServer();
  subscribeQueue();
  startPolling(3000);
}

// Stop the server session and resume playback on this device from where the
// jukebox left off. The local queue is expected to already mirror the server
// (reconciled on launch / when the resume prompt was raised).
export async function takeOverLocally(): Promise<void> {
  // Carry over the jukebox's play/paused state so transferring to this device
  // doesn't silently stop (or unexpectedly start) playback.
  const wasPlaying = useJukebox.getState().status?.playing ?? true;
  const { position } = await deactivate();
  takeOverFromJukebox(position, wasPlaying);
}

// On app launch, if a jukebox session was persisted active, check whether the
// server is still hosting it. If so, mirror the live playlist and raise the
// resume prompt; if the playlist is gone, drop the stale local flag.
export async function initJukeboxOnLaunch(): Promise<void> {
  if (!useJukebox.getState().active) return;
  let playlist: JukeboxPlaylist | undefined;
  try {
    const rsp = await getJukebox();
    playlist = (rsp as { jukeboxPlaylist?: JukeboxPlaylist }).jukeboxPlaylist;
  } catch {
    // Server unreachable at launch — keep the session for a later retry rather
    // than tearing it down on a transient error.
    return;
  }
  const entries = playlist?.entry ?? [];
  if (!playlist || entries.length === 0) {
    await deactivate();
    return;
  }
  // Raise the resume prompt before mirroring the queue so a rebuild hiccup can
  // never suppress the dialog.
  useJukebox.getState().setStatus({
    currentIndex: playlist.currentIndex,
    gain: playlist.gain,
    playing: playlist.playing,
    position: playlist.position,
  });
  useJukebox.getState().setPendingResume(true);
  try {
    applyServerPlaylist(playlist);
  } catch (error) {
    logError(error);
  }
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
  useQueue.getState().next();
  const idx = useQueue.getState().currentIndex ?? 0;
  await skipJukebox(idx, 0);
  await refreshStatus();
}

export async function jukeboxSkipPrevious() {
  useQueue.getState().previous();
  const idx = useQueue.getState().currentIndex ?? 0;
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

export {
  reconcileFromServer as jukeboxReconcileFromServer,
  refreshStatus as jukeboxRefreshStatus,
};
