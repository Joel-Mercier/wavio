import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackStatus,
} from "@/hooks/player/playbackSnapshot";

const getSnapshot = () => getPlaybackSnapshot().playing;

export function useIsPlaying() {
  return useSyncExternalStore(subscribePlaybackStatus, getSnapshot);
}
