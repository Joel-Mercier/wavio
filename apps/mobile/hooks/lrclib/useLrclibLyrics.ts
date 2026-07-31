import { useQuery } from "@tanstack/react-query";
import {
  getLrclibLyrics,
  isLrclibThrottled,
  LrclibThrottledError,
} from "@/services/lrclib/lyrics";
import { parseLrcToStructuredLyrics } from "@/utils/lyrics";

// How long a "no lyrics" result is trusted before the lookup is allowed to run
// again. Long enough that scrolling a library of instrumentals doesn't re-fan
// out seven requests per track, short enough that a track recovers on its own.
const LYRICS_MISS_STALE_MS = 24 * 60 * 60 * 1000;

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
      // A null from the cooldown isn't a miss — nothing was ever asked. Cached
      // as a success it would sit out the miss window below on every track
      // opened during a block; failing leaves the entry refetchable on the next
      // mount instead, and costs no request since getLrclibLyrics
      // short-circuits while throttled.
      if (!record && isLrclibThrottled()) throw new LrclibThrottledError();
      return parseLrcToStructuredLyrics(record, trackName, artistName);
    },
    enabled: isEnabled,
    // Retrying a block is pointless (the service short-circuits while throttled,
    // so it would only hold the spinner), but LRCLIB sits behind an edge that
    // intermittently 5xxs a query it serves fine moments later — those deserve
    // another go rather than leaving the view empty until it remounts.
    retry: (failureCount, error) =>
      !(error instanceof LrclibThrottledError) && failureCount < 2,
    // A found sheet never changes, so it never goes stale. A miss does: the same
    // lookup can start succeeding once a block lifts, once LRCLIB indexes the
    // track, or once the file's tags are corrected — so re-check it at most once
    // a day rather than pinning it for the life of the cache.
    staleTime: (query) =>
      query.state.data ? Number.POSITIVE_INFINITY : LYRICS_MISS_STALE_MS,
  });
  console.log("useLrclibLyrics", query);
  return { lyrics: query.data ?? null, isLoading: query.isLoading };
}
