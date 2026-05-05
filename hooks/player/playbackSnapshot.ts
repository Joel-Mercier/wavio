import type { AudioStatus } from "expo-audio";
import { player } from "@/services/player";

export type PlaybackSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
};

let snapshot: PlaybackSnapshot = {
  playing: player.playing,
  currentTime: player.currentTime ?? 0,
  duration: player.duration ?? 0,
};

const listeners = new Set<() => void>();

player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
  const next: PlaybackSnapshot = {
    playing: status.playing,
    currentTime: status.currentTime ?? 0,
    duration: status.duration ?? 0,
  };
  if (
    next.playing === snapshot.playing &&
    next.currentTime === snapshot.currentTime &&
    next.duration === snapshot.duration
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
});

export function subscribePlaybackStatus(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const getPlaybackSnapshot = () => snapshot;
