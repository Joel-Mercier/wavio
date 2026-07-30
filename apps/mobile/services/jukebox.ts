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

const SEEK_SETTLE_ATTEMPTS = 20;
const SEEK_SETTLE_DELAY_MS = 200;
const SEEK_LANDED_TOLERANCE_S = 1;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      // Only when jukebox is the active device — otherwise a stale server-side
      // playlist (e.g. a prior session sitting at index 0) would yank the local
      // queue back to its first track just from opening the device sheet.
      if (useJukebox.getState().active) {
        const local = useQueue.getState().currentIndex ?? 0;
        if (
          typeof status.currentIndex === "number" &&
          status.currentIndex !== local
        ) {
          useQueue.getState().setCurrentIndex(status.currentIndex);
        }
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

function isReorderOf(ids: string[], prev: string[]): boolean {
  if (ids.length !== prev.length) return false;
  const a = ids.slice().sort();
  const b = prev.slice().sort();
  return a.every((id, i) => id === b[i]);
}

// Re-upload a reordered queue and point the server back at the track that is
// actually playing. `set` leaves the server on its old index, so without the
// skip it would carry on with whatever track happens to land there — and the
// status poll would then drag the local queue onto it.
async function pushReorder(ids: string[], index: number) {
  const wasPlaying = useJukebox.getState().status?.playing ?? false;
  const position = Math.max(0, Math.floor(jukeboxGetCurrentTime()));
  await setJukebox(ids);
  await skipJukebox(index, position);
  if (!wasPlaying) await stopJukebox();
  await refreshStatus();
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
    const reordered = isReorderOf(ids, prev);
    lastKnownQueueIds = ids;
    if (ids.length === 0) {
      clearJukebox().catch(() => {});
      return;
    }
    if (reordered) {
      pushReorder(ids, clampIndex(state.currentIndex ?? 0, ids.length)).catch(
        () => {},
      );
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

async function readJukeboxStatus(): Promise<JukeboxStatus | undefined> {
  try {
    const rsp = await statusJukebox();
    return (rsp as { jukeboxStatus?: JukeboxStatus }).jukeboxStatus;
  } catch {
    return undefined;
  }
}

// The server (Navidrome) spawns a fresh mpv process on `skip` that starts playing
// from 0:00, and a seek/stop issued before the file has loaded is silently
// dropped. Poll until the server reports the track playing — hence loaded and
// seekable — before re-issuing the seek or the pause.
async function waitForPlaying(): Promise<void> {
  for (let attempt = 0; attempt < SEEK_SETTLE_ATTEMPTS; attempt++) {
    await delay(SEEK_SETTLE_DELAY_MS);
    if ((await readJukeboxStatus())?.playing) return;
  }
}

// Same load race, but for the offset seek: re-issue it once the track is playing
// and confirm the reported position actually moved, retrying across the whole
// budget so a slow-loading track still lands on the saved position instead of
// playing on from 0:00 (a single blind reseek would be dropped mid-load).
async function settleSeek(idx: number, offset: number): Promise<void> {
  for (let attempt = 0; attempt < SEEK_SETTLE_ATTEMPTS; attempt++) {
    await delay(SEEK_SETTLE_DELAY_MS);
    const status = await readJukeboxStatus();
    if (!status?.playing) continue;
    if ((status.position ?? 0) >= offset - SEEK_LANDED_TOLERANCE_S) return;
    await skipJukebox(idx, offset);
  }
}

export async function activate(opts: ActivateOptions): Promise<void> {
  const ids = readQueueIds();
  const idx = currentIndex();
  const gain = useJukebox.getState().gain;
  const offset = Math.max(0, Math.floor(opts.position));
  await clearJukebox();
  if (ids.length === 0) {
    await setGainJukebox(gain);
  } else {
    await setJukebox(ids);
    // mpv starts playing from 0:00 the moment it spawns, so seeking to the saved
    // position or pausing both entail an audible pre-roll from the top. Spawn the
    // track muted (SetVolume happens on track creation) and restore the gain once
    // it has settled, so the listener never hears the 0:00 intro.
    const hidePreroll = offset > 0 || !opts.autoplay;
    await setGainJukebox(hidePreroll ? 0 : gain);
    try {
      // Selects the current track and begins playback (mpv auto-plays from 0:00).
      await skipJukebox(idx, 0);
      if (offset > 0) await settleSeek(idx, offset);
      else if (!opts.autoplay) await waitForPlaying();
      // mpv auto-started on skip; pause so activating from a paused player lands
      // at the same spot without starting playback on the server.
      if (!opts.autoplay) await stopJukebox();
    } finally {
      if (hidePreroll) await setGainJukebox(gain);
    }
  }
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
  clearGainThrottle();
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

// The volume slider emits a scrub event every frame while dragging. Firing a
// setGain request (let alone a status refresh) on each floods the server: the
// requests queue up, the jukebox volume trails the finger by many seconds, and
// the UI locks up. Optimistically update the local gain on every call so the
// thumb stays smooth, but rate-limit the actual network write, always sending
// the latest value on the trailing edge so the released position still lands.
const GAIN_SEND_INTERVAL_MS = 300;
let gainSendTimer: ReturnType<typeof setTimeout> | null = null;
let pendingGain: number | null = null;
let lastGainSentAt = 0;

function flushGain() {
  if (pendingGain === null) return;
  const gain = pendingGain;
  pendingGain = null;
  lastGainSentAt = Date.now();
  setGainJukebox(gain).catch(() => {});
}

function clearGainThrottle() {
  if (gainSendTimer) {
    clearTimeout(gainSendTimer);
    gainSendTimer = null;
  }
  pendingGain = null;
}

export function jukeboxSetGain(gain: number) {
  const clamped = Math.max(0, Math.min(1, gain));
  useJukebox.getState().setGain(clamped);
  pendingGain = clamped;
  const elapsed = Date.now() - lastGainSentAt;
  if (elapsed >= GAIN_SEND_INTERVAL_MS) {
    if (gainSendTimer) {
      clearTimeout(gainSendTimer);
      gainSendTimer = null;
    }
    flushGain();
  } else if (!gainSendTimer) {
    gainSendTimer = setTimeout(() => {
      gainSendTimer = null;
      flushGain();
    }, GAIN_SEND_INTERVAL_MS - elapsed);
  }
}

// Push the final gain to the server immediately on drag release, bypassing the
// throttle so the last value isn't left waiting on the trailing timer.
export function jukeboxCommitGain(gain: number) {
  const clamped = Math.max(0, Math.min(1, gain));
  useJukebox.getState().setGain(clamped);
  pendingGain = clamped;
  if (gainSendTimer) {
    clearTimeout(gainSendTimer);
    gainSendTimer = null;
  }
  flushGain();
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
