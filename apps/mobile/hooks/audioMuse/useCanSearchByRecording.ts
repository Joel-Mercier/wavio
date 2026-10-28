import { useIsOnline } from "@/hooks/useIsOnline";
import useAudioMuse, {
  selectRecordingSearchAvailable,
} from "@/stores/audioMuse";

// Whether the search screens show the microphone that opens Search by
// recording: a deployment running the fingerprint model, and a way to reach it.
export function useCanSearchByRecording(): boolean {
  const isOnline = useIsOnline();
  const available = useAudioMuse(selectRecordingSearchAvailable);
  return available && isOnline;
}
