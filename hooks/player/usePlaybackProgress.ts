import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackStatus,
} from "@/hooks/player/playbackSnapshot";

export function usePlaybackProgress() {
  return useSyncExternalStore(subscribePlaybackStatus, getPlaybackSnapshot);
}
