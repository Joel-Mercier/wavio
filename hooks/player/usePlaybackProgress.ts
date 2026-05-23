import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";

export function usePlaybackProgress() {
  return useSyncExternalStore(subscribePlaybackProgress, getPlaybackSnapshot);
}
