import type { AudioStatus } from "expo-audio";
import {
  getActivePlayer,
  getActiveSlot,
  subscribeActiveSlot,
} from "@/services/player";

export type PlaybackSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
};

let snapshot: PlaybackSnapshot = {
  playing: getActivePlayer().playing,
  currentTime: getActivePlayer().currentTime ?? 0,
  duration: getActivePlayer().duration ?? 0,
};

const listeners = new Set<() => void>();

function pushSnapshot(next: PlaybackSnapshot) {
  if (
    next.playing === snapshot.playing &&
    next.currentTime === snapshot.currentTime &&
    next.duration === snapshot.duration
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
}

// We can't enumerate the player array from outside player.ts; rely on the
// active player ref + status events. When the slot swaps, immediately resync
// the snapshot to the new active player.
function attachToActive() {
  const active = getActivePlayer();
  return active.addListener("playbackStatusUpdate", (status: AudioStatus) => {
    if (getActivePlayer() !== active) return;
    pushSnapshot({
      playing: status.playing,
      currentTime: status.currentTime ?? 0,
      duration: status.duration ?? 0,
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
  const active = getActivePlayer();
  pushSnapshot({
    playing: active.playing,
    currentTime: active.currentTime ?? 0,
    duration: active.duration ?? 0,
  });
});

export function subscribePlaybackStatus(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const getPlaybackSnapshot = () => snapshot;
