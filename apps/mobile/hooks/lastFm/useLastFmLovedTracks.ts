import { useQuery } from "@tanstack/react-query";
import { LASTFM_NETWORK_MODE } from "@/hooks/lastFm/networkMode";
import { useLastFmEnabled } from "@/hooks/lastFm/useLastFmEnabled";
import { fetchLovedTracks } from "@/services/lastFm/user";
import { retryUnlessClientError } from "@/services/retry";

// Loves move only when the user taps a heart, on either side, so the global
// five-minute default would refetch a list that almost never changes.
const LOVED_TRACKS_STALE_TIME = 1000 * 60 * 15;

/**
 * The most recently loved tracks on the account, for the preview list on the
 * settings screen. The import reads every page itself
 * (services/lastFm/lovedImport.ts) rather than paging through this cache.
 */
export function useLastFmLovedTracks({ limit = 10, enabled = true } = {}) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "lovedTracks", userName, limit],
    queryFn: ({ signal }) =>
      fetchLovedTracks({ userName: userName as string, limit, signal }),
    enabled: isEnabled,
    staleTime: LOVED_TRACKS_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}
