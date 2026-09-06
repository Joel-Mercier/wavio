import { useQuery } from "@tanstack/react-query";
import { LASTFM_NETWORK_MODE } from "@/hooks/lastFm/networkMode";
import { useLastFmEnabled } from "@/hooks/lastFm/useLastFmEnabled";
import {
  fetchRecentTracks,
  fetchTopAlbums,
  fetchTopArtists,
  fetchTopTracks,
  fetchUserInfo,
} from "@/services/lastFm/stats";
import type { LastFmPeriod } from "@/services/lastFm/types";
import { retryUnlessClientError } from "@/services/retry";

// Unlike ListenBrainz, Last.fm computes these on read, so they move with every
// scrobble rather than once a day. Still well above the global five-minute
// default — a top-ten doesn't reorder while you look at it — but not an hour.
const STATS_STALE_TIME = 1000 * 60 * 15;
// The play count and the recent list are the two that visibly lag if they go
// stale: both change with the track that is playing right now.
const LIVE_STALE_TIME = 1000 * 60 * 2;

export function useLastFmUserInfo({ enabled = true } = {}) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "userInfo", userName],
    queryFn: ({ signal }) =>
      fetchUserInfo({ userName: userName as string, signal }),
    enabled: isEnabled,
    staleTime: LIVE_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useLastFmTopArtists(
  period: LastFmPeriod,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "topArtists", userName, period],
    queryFn: ({ signal }) =>
      fetchTopArtists({ userName: userName as string, period, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useLastFmTopAlbums(
  period: LastFmPeriod,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "topAlbums", userName, period],
    queryFn: ({ signal }) =>
      fetchTopAlbums({ userName: userName as string, period, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useLastFmTopTracks(
  period: LastFmPeriod,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "topTracks", userName, period],
    queryFn: ({ signal }) =>
      fetchTopTracks({ userName: userName as string, period, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

/**
 * The scrobbles behind everything above. Deliberately not keyed by period —
 * `user.getRecentTracks` has no period parameter, and re-fetching it when the
 * tabs change would only ever produce the same answer.
 */
export function useLastFmRecentTracks({ enabled = true } = {}) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);

  return useQuery({
    queryKey: ["lastfm", "recentTracks", userName],
    queryFn: ({ signal }) =>
      fetchRecentTracks({ userName: userName as string, signal }),
    enabled: isEnabled,
    staleTime: LIVE_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}
