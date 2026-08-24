import { useQuery } from "@tanstack/react-query";
import { lyricsSearch, soundSearch } from "@/services/audioMuse/search";
import { retryUnlessClientError } from "@/services/retry";
import useAudioMuse from "@/stores/audioMuse";

// AudioMuse's own floor moved from 3 characters to 1 across releases, so the
// client holds to the strictest one any supported build enforces: a shorter
// query is rejected outright by older instances, and two characters carry no
// semantic signal for these indexes anyway.
export const MIN_QUERY_LENGTH = 3;

// Search the *sound* of a track (CLAP text-to-audio) rather than its metadata.
export function useSoundSearch(
  query: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const isConnected = useAudioMuse((store) => store.isConnected);
  const clapEnabled = useAudioMuse((store) => store.clapEnabled);
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["audiomuse", "soundSearch", trimmed],
    queryFn: () => soundSearch(trimmed),
    enabled:
      enabled &&
      isConnected &&
      clapEnabled &&
      trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60 * 5,
    retry: retryUnlessClientError,
  });
}

// Search lyrics by theme and meaning rather than exact wording.
export function useLyricsSearch(
  query: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const isConnected = useAudioMuse((store) => store.isConnected);
  const lyricsEnabled = useAudioMuse((store) => store.lyricsEnabled);
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["audiomuse", "lyricsSearch", trimmed],
    queryFn: () => lyricsSearch(trimmed),
    enabled:
      enabled &&
      isConnected &&
      lyricsEnabled &&
      trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60 * 5,
    retry: retryUnlessClientError,
  });
}
