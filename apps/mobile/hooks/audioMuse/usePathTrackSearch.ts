import { useQuery } from "@tanstack/react-query";
import { MIN_QUERY_LENGTH } from "@/hooks/audioMuse/useAudioMuseTextSearch";
import { retryUnlessClientError } from "@/services/audioMuse";
import { searchPathTracks } from "@/services/audioMuse/path";
import useAudioMuse, { selectSongPathAvailable } from "@/stores/audioMuse";

// Autocomplete for the path endpoint picker. Searches AudioMuse's own catalogue
// rather than the music server's, so every result is a track it has analysed and
// can therefore route through — see searchPathTracks.
export function usePathTrackSearch(
  query: string,
  {
    lyrics = false,
    enabled = true,
  }: { lyrics?: boolean; enabled?: boolean } = {},
) {
  const available = useAudioMuse(selectSongPathAvailable);
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["audiomuse", "pathSearch", lyrics, trimmed],
    queryFn: ({ signal }) => searchPathTracks(trimmed, { lyrics, signal }),
    enabled: enabled && available && trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60 * 5,
    retry: retryUnlessClientError,
  });
}
