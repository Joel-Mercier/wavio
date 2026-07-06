import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";

const getSnapshot = () => getPlaybackSnapshot().buffering;

export function useIsBuffering() {
  return useSyncExternalStore(subscribePlaybackState, getSnapshot);
}
