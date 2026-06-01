import { useEffect, useSyncExternalStore } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";

// Numeric snapshot for consumers that need the value in render (time labels, the
// seek slider). Re-renders on every progress tick.
export function usePlaybackProgress() {
  return useSyncExternalStore(subscribePlaybackProgress, getPlaybackSnapshot);
}

// Drives a Reanimated shared value (0..1 progress fraction) from the snapshot's
// progress channel WITHOUT triggering React re-renders. Use this for always-on
// progress UI (e.g. the floating player bar) so each ~4 Hz tick is a single
// shared-value write + a UI-thread style update, instead of a full React render
// + layout commit on the JS thread.
export function usePlaybackProgressValue(): SharedValue<number> {
  const progress = useSharedValue(0);
  useEffect(() => {
    const update = () => {
      const { currentTime, duration } = getPlaybackSnapshot();
      progress.value =
        duration && duration > 0
          ? Math.min(1, Math.max(0, (currentTime ?? 0) / duration))
          : 0;
    };
    update();
    return subscribePlaybackProgress(update);
  }, [progress]);
  return progress;
}
