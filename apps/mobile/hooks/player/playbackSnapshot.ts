import type { AudioStatus } from "expo-audio";
import {
  getActivePlayer,
  getActiveSlot,
  subscribeActiveSlot,
} from "@/services/player";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";

export type PlaybackSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
};

// Transcoded streams (a streaming format that differs from the source file)
// are served without a known length, so the player reports duration 0. Fall
// back to the current queue track's metadata duration so seek/progress UI works.
function currentTrackDuration(): number {
  return useQueue.getState().getCurrent()?.duration ?? 0;
}

function readLocalSnapshot(): PlaybackSnapshot {
  const p = getActivePlayer();
  return {
    playing: p.playing,
    currentTime: p.currentTime ?? 0,
    duration: p.duration || currentTrackDuration(),
  };
}

function readJukeboxSnapshot(): PlaybackSnapshot {
  const status = useJukebox.getState().status;
  const current = useQueue.getState().getCurrent();
  return {
    playing: status?.playing ?? false,
    currentTime: status?.position ?? 0,
    duration: current?.duration ?? 0,
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
  const durationChanged = next.duration !== snapshot.duration;
  const timeChanged = next.currentTime !== snapshot.currentTime;
  if (!playingChanged && !durationChanged && !timeChanged) return;
  snapshot = next;
  if (playingChanged || durationChanged) {
    for (const l of stateListeners) l();
  }
  for (const l of progressListeners) l();
}

// We can't enumerate the player array from outside player.ts; rely on the
// active player ref + status events. When the slot swaps, immediately resync
// the snapshot to the new active player.
function attachToActive() {
  const active = getActivePlayer();
  return active.addListener("playbackStatusUpdate", (status: AudioStatus) => {
    if (getActivePlayer() !== active) return;
    if (useJukebox.getState().active) return;
    pushSnapshot({
      playing: status.playing,
      currentTime: status.currentTime ?? 0,
      duration: status.duration || currentTrackDuration(),
    });
  });
}

let activeSub = attachToActive();
let trackedSlot = getActiveSlot();

subscribeActiveSlot(() => {
  if (trackedSlot === getActiveSlot()) return;
  trackedSlot = getActiveSlot();
  try {
    activeSub?.remove?.();
  } catch {}
  activeSub = attachToActive();
  pushSnapshot(readSnapshot());
});

// Jukebox status changes (poll-driven) and queue track changes both shift the
// snapshot when jukebox is the active source.
useJukebox.subscribe(() => {
  pushSnapshot(readSnapshot());
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
  return () => {
    progressListeners.delete(cb);
  };
}

export const getPlaybackSnapshot = () => snapshot;
