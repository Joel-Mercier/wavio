import type { PlaybackSnapshot } from "@/hooks/player/playbackSnapshot";
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
import { registerRemoteTarget } from "@/services/playback/remoteTarget";
import { restoreServerQueue, takeOverFromRemote } from "@/services/player";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { logError } from "@/utils/log";

type ActivateOptions = {
  position: number;
  autoplay: boolean;
};

// Snapshot of the queue as the server last saw it, so the subscription below can
// tell what actually moved: the playlist, the position within it, or nothing.
let lastKnownQueueIds: string[] | null = null;
let lastKnownIndex = 0;
let lastKnownCurrentId: string | null = null;
// Set while we are the ones mutating the queue (adopting server state, or moving
// it ahead of an explicit skip), so the subscription doesn't push that change
// straight back to the server it came from.
let suppressQueuePush = false;
// Non-zero while a push is in flight; the poll stands down so it can't pull a
// pre-push index and drag the queue back onto the track the user just left.
let pushesInFlight = 0;
// Set while a selection has muted the server for its pre-roll, so a deactivate
// that strands it mid-settle can still hand the server back at the user's gain.
let mutedForPreroll = false;
// Bumped by every selectTrack call so a superseded one can bail out of its
// settle loop instead of fighting the newer selection.
let selectGeneration = 0;
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

function captureQueueSnapshot() {
  const state = useQueue.getState();
  const index = state.currentIndex ?? 0;
  lastKnownQueueIds = state.queue.map((t) => t.id);
  lastKnownIndex = index;
  lastKnownCurrentId = state.queue[index]?.id ?? null;
}

// Mutate the queue on the server's behalf (or ahead of a skip we issue
// ourselves) without the subscription echoing it back. The listener fires
// synchronously inside the store's set, so a plain flag is enough; re-snapshot
// afterwards so the next real change is measured against what we just applied.
function withoutQueuePush<T>(mutate: () => T): T {
  suppressQueuePush = true;
  try {
    return mutate();
  } finally {
    suppressQueuePush = false;
    captureQueueSnapshot();
  }
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
        const serverIndex = status.currentIndex;
        if (typeof serverIndex === "number" && serverIndex !== local) {
          withoutQueuePush(() =>
            useQueue.getState().setCurrentIndex(serverIndex),
          );
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
  if (pushesInFlight > 0) return;
  let playlist: JukeboxPlaylist | undefined;
  try {
    const rsp = await getJukebox();
    playlist = (rsp as { jukeboxPlaylist?: JukeboxPlaylist }).jukeboxPlaylist;
  } catch {
    return;
  }
  // Re-checked after the read: a push that started while it was in flight makes
  // this response describe the pre-push server, which would rewind the queue.
  if (pushesInFlight > 0) return;
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
    const serverIndex = playlist.currentIndex;
    if (typeof serverIndex === "number" && serverIndex !== local) {
      withoutQueuePush(() => useQueue.getState().setCurrentIndex(serverIndex));
    }
    return;
  }

  if (serverIds.length === 0) {
    withoutQueuePush(() => useQueue.getState().clearQueue());
    return;
  }

  const tracks = (playlist.entry ?? []).map((entry) => childToTrack(entry));
  const idx = clampIndex(playlist.currentIndex, tracks.length);
  withoutQueuePush(() =>
    restoreServerQueue(tracks, idx, playlist.position ?? 0),
  );
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

// The tail `ids` adds on top of `prev`, or null when this isn't a pure append.
// Worth detecting because Navidrome's `add` leaves the playing track alone,
// where `set` is a clear + add that tears it down.
function appendedTail(ids: string[], prev: string[]): string[] | null {
  if (ids.length <= prev.length) return null;
  for (let i = 0; i < prev.length; i++) {
    if (ids[i] !== prev[i]) return null;
  }
  return ids.slice(prev.length);
}

// Mirror a local queue change onto the server. `set` is a clear + add on
// Navidrome (core/playback/device.go): it drops the playing track and leaves the
// index at 0, so it always has to be followed by a select — which is also the
// only way to move the server's index when the playlist itself didn't change.
async function pushQueue(
  ids: string[] | null,
  index: number,
  offset: number,
  autoplay: boolean,
) {
  return withPushShield(async () => {
    if (ids) await setJukebox(ids);
    await selectTrack(index, offset, autoplay);
    await refreshStatus();
  });
}

// Everything that moves the server's index runs inside this, so the poll above
// stands down for the round-trip instead of reading a half-applied state.
async function withPushShield<T>(fn: () => Promise<T>): Promise<T> {
  pushesInFlight += 1;
  try {
    return await fn();
  } finally {
    pushesInFlight -= 1;
  }
}

function subscribeQueue() {
  if (queueUnsub) return;
  captureQueueSnapshot();
  queueUnsub = useQueue.subscribe((state) => {
    if (!useJukebox.getState().active || suppressQueuePush) return;
    const ids = state.queue.map((t) => t.id);
    const index = state.currentIndex ?? 0;
    const prev = lastKnownQueueIds ?? [];
    const listChanged =
      ids.length !== prev.length || ids.some((id, i) => id !== prev[i]);
    // Tapping another track in a list the server already holds moves only the
    // index — the id comparison above sees nothing, which is why selecting a
    // track used to be a no-op the status poll then undid.
    if (!listChanged && index === lastKnownIndex) return;
    const previousCurrentId = lastKnownCurrentId;
    const target = clampIndex(index, ids.length);
    lastKnownQueueIds = ids;
    lastKnownIndex = index;
    lastKnownCurrentId = ids[target] ?? null;
    if (ids.length === 0) {
      clearJukebox().catch(() => {});
      return;
    }
    const appended = listChanged ? appendedTail(ids, prev) : null;
    const sameTrack = ids[target] === previousCurrentId;
    if (appended && sameTrack) {
      jukeboxAdd(appended).catch(() => {});
      return;
    }
    // The same track is still current (a reorder, a removal elsewhere): keep it
    // playing where it is, in whatever state the server was in. A different one
    // means the user picked it, so start from the top — and actually play it:
    // server-driven changes come through suppressed, so this is a local play
    // intent, and inheriting a paused jukebox would stop the track just tapped.
    const offset = sameTrack
      ? Math.max(0, Math.floor(jukeboxGetCurrentTime()))
      : 0;
    const autoplay = sameTrack
      ? (useJukebox.getState().status?.playing ?? false)
      : true;
    pushQueue(listChanged ? ids : null, target, offset, autoplay).catch(
      () => {},
    );
  });
}

function unsubscribeQueue() {
  queueUnsub?.();
  queueUnsub = null;
  lastKnownQueueIds = null;
  lastKnownIndex = 0;
  lastKnownCurrentId = null;
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
async function waitForPlaying(isCurrent: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < SEEK_SETTLE_ATTEMPTS; attempt++) {
    await delay(SEEK_SETTLE_DELAY_MS);
    if (!isCurrent()) return;
    if ((await readJukeboxStatus())?.playing) return;
  }
}

// Same load race, but for the offset seek: re-issue it once the track is playing
// and confirm the reported position actually moved, retrying across the whole
// budget so a slow-loading track still lands on the saved position instead of
// playing on from 0:00 (a single blind reseek would be dropped mid-load).
async function settleSeek(
  idx: number,
  offset: number,
  isCurrent: () => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < SEEK_SETTLE_ATTEMPTS; attempt++) {
    await delay(SEEK_SETTLE_DELAY_MS);
    if (!isCurrent()) return;
    const status = await readJukeboxStatus();
    if (!status?.playing) continue;
    if ((status.position ?? 0) >= offset - SEEK_LANDED_TOLERANCE_S) return;
    await skipJukebox(idx, offset);
  }
}

// Point the server at a track and land it in the requested play state.
// `skip` is the only action that moves Navidrome's playback index, and it spawns
// a fresh mpv process whose command template carries no `--pause` — so selecting
// a track *always* starts audio from 0:00, whatever state the jukebox was in.
// Restoring a saved position or staying paused therefore both entail an audible
// pre-roll from the top, and a seek/stop issued before the file has loaded is
// silently dropped. Spawn the track muted (SetVolume happens on track creation)
// and restore the gain once the server confirms it settled.
async function selectTrack(index: number, offset: number, autoplay: boolean) {
  // Only the newest selection may drive the settle loops and restore the gain:
  // a superseded one would keep re-issuing skips for a track the user has
  // already moved off, and un-mute the newer selection's pre-roll.
  const generation = ++selectGeneration;
  const isCurrent = () => selectGeneration === generation;
  const gain = useJukebox.getState().gain;
  const hidePreroll = offset > 0 || !autoplay;
  await setGainJukebox(hidePreroll ? 0 : gain);
  if (hidePreroll) mutedForPreroll = true;
  // A newer selection (or a deactivate) that landed during that round-trip owns
  // the server now: skipping would drag it back onto the track the user left.
  if (!isCurrent()) return;
  try {
    await skipJukebox(index, 0);
    if (offset > 0) await settleSeek(index, offset, isCurrent);
    else if (!autoplay) await waitForPlaying(isCurrent);
    if (!autoplay && isCurrent()) await stopJukebox();
  } finally {
    // Re-read instead of restoring the captured value: the settle loops run for
    // seconds, and the volume slider may have moved in the meantime.
    if (hidePreroll && isCurrent()) {
      await setGainJukebox(useJukebox.getState().gain);
      mutedForPreroll = false;
    }
  }
}

export async function activate(opts: ActivateOptions): Promise<void> {
  const ids = readQueueIds();
  const idx = currentIndex();
  const offset = Math.max(0, Math.floor(opts.position));
  await clearJukebox();
  if (ids.length === 0) {
    await setGainJukebox(useJukebox.getState().gain);
  } else {
    await setJukebox(ids);
    await selectTrack(idx, offset, opts.autoplay);
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
  takeOverFromRemote(position, wasPlaying);
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
  // Strand any selection still settling: its retries would restart playback on
  // a server the user has just handed control back from. It skips its own gain
  // restore as superseded, so hand the server back at the user's volume here.
  selectGeneration += 1;
  if (mutedForPreroll) {
    mutedForPreroll = false;
    try {
      await setGainJukebox(useJukebox.getState().gain);
    } catch {
      // Same as the stop above.
    }
  }
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

// The queue move is suppressed so the subscription doesn't push a select for it;
// these issue their own skip, and going through the subscription would cost the
// pre-roll mute the transport buttons don't need.
export async function jukeboxSkipNext() {
  withoutQueuePush(() => useQueue.getState().next());
  const idx = useQueue.getState().currentIndex ?? 0;
  await withPushShield(async () => {
    await skipJukebox(idx, 0);
    await refreshStatus();
  });
}

export async function jukeboxSkipPrevious() {
  withoutQueuePush(() => useQueue.getState().previous());
  const idx = useQueue.getState().currentIndex ?? 0;
  await withPushShield(async () => {
    await skipJukebox(idx, 0);
    await refreshStatus();
  });
}

export async function jukeboxSeekTo(seconds: number) {
  const idx = currentIndex();
  await withPushShield(async () => {
    await skipJukebox(idx, Math.max(0, Math.floor(seconds)));
    await refreshStatus();
  });
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

// ── Remote target ────────────────────────────────────────────────────────────

// The jukebox plays server-side and its status is only refreshed by the ~3s
// poll above, so the raw reported position steps every few seconds — too coarse
// for a smooth seek bar or synced lyrics. Interpolate between polls off the wall
// clock: remember the last server position and when it arrived, then advance it
// while playing. Each poll rebases onto the authoritative position, so
// interpolation error can never accumulate.
let basePosition = 0;
let baseAt = Date.now();

registerRemoteTarget({
  id: "jukebox",
  isActive: () => useJukebox.getState().active,
  play: () => {
    jukeboxPlay().catch(() => {});
  },
  pause: () => {
    jukeboxPause().catch(() => {});
  },
  togglePlayPause: () => {
    jukeboxTogglePlayPause().catch(() => {});
  },
  seekTo: (seconds) => {
    jukeboxSeekTo(seconds).catch(() => {});
  },
  skipNext: () => {
    jukeboxSkipNext().catch(() => {});
  },
  skipPrevious: () => {
    jukeboxSkipPrevious().catch(() => {});
  },
  getCurrentTime: jukeboxGetCurrentTime,
  isPlaying: jukeboxIsPlaying,
  setVolume: jukeboxSetGain,
  isInterpolating: () =>
    useJukebox.getState().active &&
    (useJukebox.getState().status?.playing ?? false),
  readSnapshot: (): PlaybackSnapshot => {
    const playing = useJukebox.getState().status?.playing ?? false;
    const duration = useQueue.getState().getCurrent()?.duration ?? 0;
    const elapsed = playing ? (Date.now() - baseAt) / 1000 : 0;
    let currentTime = basePosition + elapsed;
    if (duration > 0) currentTime = Math.min(currentTime, duration);
    return { playing, buffering: false, currentTime, duration };
  },
  subscribe: (onChange) =>
    useJukebox.subscribe((state, prev) => {
      if (state.status !== prev.status) {
        basePosition = state.status?.position ?? 0;
        baseAt = Date.now();
      }
      onChange();
    }),
});
