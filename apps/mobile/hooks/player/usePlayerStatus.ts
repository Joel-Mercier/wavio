import { useAudioPlayerStatus } from "expo-audio";
import { getActivePlayer } from "@/services/player";

export function usePlayerStatus() {
  return useAudioPlayerStatus(getActivePlayer());
}
