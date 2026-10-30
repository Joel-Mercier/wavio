import { useCapabilities } from "@/hooks/useCapabilities";
import useQueue from "@/stores/queue";

// Casting of any kind needs a URL the receiver can fetch for itself. The music
// backend decides that for its own tracks; an audiobook streams from
// Audiobookshelf, whose public session URLs a receiver can always fetch.
export function useCanCast(): boolean {
  const capabilities = useCapabilities();
  const playingAudiobook = useQueue(
    (s) =>
      s.currentIndex != null && s.queue[s.currentIndex]?.source === "audiobook",
  );
  return capabilities.remoteStreamableUrl || playingAudiobook;
}
