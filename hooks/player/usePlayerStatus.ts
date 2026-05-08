import { useAudioPlayerStatus } from "expo-audio";
import { useSyncExternalStore } from "react";
import { getActivePlayer, subscribeActiveSlot } from "@/services/player";

export function usePlayerStatus() {
  // Re-render when the active player swaps (crossfade / gapless transition)
  // so useAudioPlayerStatus re-subscribes against the new instance.
  useSyncExternalStore(subscribeActiveSlot, getActivePlayer, getActivePlayer);
  return useAudioPlayerStatus(getActivePlayer());
}
