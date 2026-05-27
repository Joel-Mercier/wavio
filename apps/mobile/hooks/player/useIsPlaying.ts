import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";

const getSnapshot = () => getPlaybackSnapshot().playing;

export function useIsPlaying() {
  return useSyncExternalStore(subscribePlaybackState, getSnapshot);
}
