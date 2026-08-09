import { useQuery } from "@tanstack/react-query";
import {
  isLrclibThrottled,
  LrclibThrottledError,
  searchLrclibRecords,
} from "@/services/lrclib/lyrics";

// Every candidate LRCLIB record for a track, for the manual picker. Kept apart
// from useLrclibLyrics (which resolves the one record to display): this only
// runs while the picker sheet is open, so browsing a library never widens the
// automatic lookup's request footprint.
//
// The key is namespaced under its own prefix rather than nested inside
// ["lrclib", …] so it can't collide with a lyrics lookup for a track literally
// named "search", and so config/queryClient can exclude it from the persisted
// cache by prefix alone.
export function useLrclibSearch({
  trackName,
  artistName,
  duration,
  enabled = true,
}: {
  trackName?: string;
  artistName?: string;
  duration?: number;
  enabled?: boolean;
}) {
  const query = useQuery({
    queryKey: ["lrclib:search", trackName, artistName, duration],
    queryFn: async () => {
      const records = await searchLrclibRecords({
        trackName: trackName as string,
        artistName: artistName as string,
        duration,
      });
      // Nothing was ever asked while blocked — fail so the entry stays
      // refetchable instead of caching an empty list for the session. Costs no
      // request: searchLrclibRecords short-circuits while throttled.
      if (records.length === 0 && isLrclibThrottled()) {
        throw new LrclibThrottledError();
      }
      return records;
    },
    enabled: enabled && !!trackName && !!artistName,
    retry: (failureCount, error) =>
      !(error instanceof LrclibThrottledError) && failureCount < 2,
  });

  return {
    results: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
