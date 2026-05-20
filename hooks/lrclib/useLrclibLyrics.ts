import { useQuery } from "@tanstack/react-query";
import { getLrclibLyrics } from "@/services/lrclib/lyrics";
import { parseLrcToStructuredLyrics } from "@/utils/lyrics";

export function useLrclibLyrics({
  trackName,
  artistName,
  albumName,
  duration,
  enabled = true,
}: {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  enabled?: boolean;
}) {
  const isEnabled = enabled && !!trackName && !!artistName;
  const query = useQuery({
    queryKey: ["lrclib", trackName, artistName, albumName, duration],
    queryFn: async () => {
      const record = await getLrclibLyrics({
        trackName: trackName as string,
        artistName: artistName as string,
        albumName,
        duration,
      });
      return parseLrcToStructuredLyrics(record, trackName, artistName);
    },
    enabled: isEnabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { lyrics: query.data ?? null, isLoading: query.isLoading };
}
