import type { AudioStatus } from "expo-audio";
import {
  activeRemoteTarget,
  subscribeRemoteChange,
} from "@/services/playback/targets";
import { getActivePlayer, getStreamStartOffset } from "@/services/player";
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

function readSnapshot(): PlaybackSnapshot {
  return activeRemoteTarget()?.readSnapshot() ?? readLocalSnapshot();
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
  if (activeRemoteTarget()) return;
  pushSnapshot({
    playing: status.playing,
    buffering: status.isBuffering,
    currentTime: (status.currentTime ?? 0) + getStreamStartOffset(),
    duration: resolveDuration(status.duration),
  });
});

// Advances a remote target's interpolated position between its own updates so
// the seek bar and synced lyrics move smoothly instead of stepping every 1-3s.
// Only runs while a remote target is the active source, says it wants
// interpolating, and something is actually observing progress.
let remoteTicker: ReturnType<typeof setInterval> | null = null;
function syncRemoteTicker() {
  const target = activeRemoteTarget();
  const shouldRun = !!target?.isInterpolating() && progressListeners.size > 0;
  if (shouldRun && !remoteTicker) {
    remoteTicker = setInterval(() => pushSnapshot(readSnapshot()), 250);
  } else if (!shouldRun && remoteTicker) {
    clearInterval(remoteTicker);
    remoteTicker = null;
  }
}

// A remote target's state moving (its poll landing, a session opening or
// closing) shifts the snapshot. Each target rebases its own interpolation onto
// whatever authoritative position came with the change before notifying.
subscribeRemoteChange(() => {
  pushSnapshot(readSnapshot());
  syncRemoteTicker();
});

useQueue.subscribe(() => {
  if (!activeRemoteTarget()) return;
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
  syncRemoteTicker();
  return () => {
    progressListeners.delete(cb);
    syncRemoteTicker();
  };
}

export const getPlaybackSnapshot = () => snapshot;
