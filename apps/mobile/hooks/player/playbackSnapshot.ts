import type { AudioStatus } from "expo-audio";
import { getActivePlayer, getStreamStartOffset } from "@/services/player";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";

export type PlaybackSnapshot = {
  playing: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
};

// Transcoded streams (a streaming format that differs from the source file)
// are served without a known length, so the player reports duration 0. Fall
// back to the current queue track's metadata duration so seek/progress UI works.
function currentTrackDuration(): number {
  return useQueue.getState().getCurrent()?.duration ?? 0;
}

// A transcoded stream reloaded at an offset (a seek/resume via Subsonic
// `timeOffset`) restarts its own clock at ~0 and, once its length becomes known,
// reports only its REMAINING duration (fullDuration − offset). Since currentTime
// adds the offset back to recover the absolute position, trusting that shortened
// duration would peg progress past its end (bar jumps to the end, total-time
// label shrinks). Whenever an offset is in play, use the full metadata duration.
function resolveDuration(rawDuration: number): number {
  if (getStreamStartOffset() > 0) return currentTrackDuration();
  return rawDuration || currentTrackDuration();
}

function readLocalSnapshot(): PlaybackSnapshot {
  const p = getActivePlayer();
  return {
    playing: p.playing,
    buffering: p.isBuffering,
    // A transcoded stream reloaded at a Subsonic timeOffset restarts its own
    // clock near 0, so add the offset back to recover the true track position.
    currentTime: (p.currentTime ?? 0) + getStreamStartOffset(),
    duration: resolveDuration(p.duration),
  };
}

// The jukebox plays server-side and its status is only refreshed by the ~3s
// poll in services/jukebox.ts, so the raw reported position steps every few
// seconds — too coarse for a smooth seek bar or synced lyrics. Interpolate
// between polls off the wall clock: remember the last server position and when
// it arrived, then advance it while playing. Each poll resets this base to the
// authoritative position, so interpolation error can never accumulate.
let jukeboxBasePosition = 0;
let jukeboxBaseAt = Date.now();

function resetJukeboxInterpolation(position: number) {
  jukeboxBasePosition = position;
  jukeboxBaseAt = Date.now();
}

function readJukeboxSnapshot(): PlaybackSnapshot {
  const status = useJukebox.getState().status;
  const current = useQueue.getState().getCurrent();
  const playing = status?.playing ?? false;
  const duration = current?.duration ?? 0;
  const elapsed = playing ? (Date.now() - jukeboxBaseAt) / 1000 : 0;
  let currentTime = jukeboxBasePosition + elapsed;
  if (duration > 0) currentTime = Math.min(currentTime, duration);
  return {
    playing,
    buffering: false,
    currentTime,
    duration,
  };
}

function readSnapshot(): PlaybackSnapshot {
  return useJukebox.getState().active
    ? readJukeboxSnapshot()
    : readLocalSnapshot();
}

let snapshot: PlaybackSnapshot = readSnapshot();

// Two channels so high-frequency time ticks don't wake listeners that only
// care about play/pause transitions. `state` fires only when playing or
// duration change; `progress` fires on every snapshot change (including the
// 4 Hz currentTime updates).
const stateListeners = new Set<() => void>();
const progressListeners = new Set<() => void>();

function pushSnapshot(next: PlaybackSnapshot) {
  const playingChanged = next.playing !== snapshot.playing;
  const bufferingChanged = next.buffering !== snapshot.buffering;
  const durationChanged = next.duration !== snapshot.duration;
  const timeChanged = next.currentTime !== snapshot.currentTime;
  if (!playingChanged && !bufferingChanged && !durationChanged && !timeChanged)
    return;
  snapshot = next;
  if (playingChanged || bufferingChanged || durationChanged) {
    for (const l of stateListeners) l();
  }
  for (const l of progressListeners) l();
}

getActivePlayer().addListener("playbackStatusUpdate", (status: AudioStatus) => {
  if (useJukebox.getState().active) return;
  pushSnapshot({
    playing: status.playing,
    buffering: status.isBuffering,
    currentTime: (status.currentTime ?? 0) + getStreamStartOffset(),
    duration: resolveDuration(status.duration),
  });
});

// Advances the interpolated jukebox position between server polls so the seek
// bar and synced lyrics move smoothly instead of stepping every ~3s. Only runs
// while the jukebox is the active source, is playing, and something is actually
// observing progress.
let jukeboxTicker: ReturnType<typeof setInterval> | null = null;
function syncJukeboxTicker() {
  const shouldRun =
    useJukebox.getState().active &&
    (useJukebox.getState().status?.playing ?? false) &&
    progressListeners.size > 0;
  if (shouldRun && !jukeboxTicker) {
    jukeboxTicker = setInterval(() => pushSnapshot(readSnapshot()), 250);
  } else if (!shouldRun && jukeboxTicker) {
    clearInterval(jukeboxTicker);
    jukeboxTicker = null;
  }
}

// Jukebox status changes (poll-driven) and queue track changes both shift the
// snapshot when jukebox is the active source. Each fresh status is the server's
// authoritative position, so rebase interpolation onto it.
useJukebox.subscribe((state, prev) => {
  if (state.status !== prev.status) {
    resetJukeboxInterpolation(state.status?.position ?? 0);
  }
  pushSnapshot(readSnapshot());
  syncJukeboxTicker();
});

useQueue.subscribe(() => {
  if (!useJukebox.getState().active) return;
  pushSnapshot(readSnapshot());
});

export function subscribePlaybackState(cb: () => void) {
  stateListeners.add(cb);
  return () => {
    stateListeners.delete(cb);
  };
}

export function subscribePlaybackProgress(cb: () => void) {
  progressListeners.add(cb);
  syncJukeboxTicker();
  return () => {
    progressListeners.delete(cb);
    syncJukeboxTicker();
  };
}

export const getPlaybackSnapshot = () => snapshot;
