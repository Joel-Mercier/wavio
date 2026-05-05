import { useAudioPlayerStatus } from "expo-audio";
import { player } from "@/services/player";

export function usePlayerStatus() {
  return useAudioPlayerStatus(player);
}
