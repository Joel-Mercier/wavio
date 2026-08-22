import { useQuery } from "@tanstack/react-query";
import { LISTENBRAINZ_NETWORK_MODE } from "@/hooks/listenBrainz/networkMode";
import { useListenBrainzEnabled } from "@/hooks/listenBrainz/useListenBrainzEnabled";
import {
  fetchArtistCountries,
  fetchArtistEvolution,
  fetchDailyActivity,
  fetchEraActivity,
  fetchGenreActivity,
  fetchListenCount,
  fetchListeningActivity,
  fetchTopArtists,
  fetchTopRecordings,
  fetchTopReleases,
} from "@/services/listenBrainz/stats";
import type { StatsRange } from "@/services/listenBrainz/types";
import { retryUnlessClientError } from "@/services/retry";

// The statistics are recomputed by a batch job roughly once a day, so the
// global five-minute staleness default would refetch them dozens of times over
// a session for data that cannot have changed.
const STATS_STALE_TIME = 1000 * 60 * 60;
// The total, by contrast, is live — it moves with every scrobble.
const LISTEN_COUNT_STALE_TIME = 1000 * 60 * 5;

const useStatsEnabled = useListenBrainzEnabled;

export function useListenBrainzListenCount({ enabled = true } = {}) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "listenCount", userName],
    queryFn: ({ signal }) => fetchListenCount({ signal }),
    enabled: isEnabled,
    staleTime: LISTEN_COUNT_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzTopArtists(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "topArtists", userName, range],
    queryFn: ({ signal }) => fetchTopArtists({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzTopReleases(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "topReleases", userName, range],
    queryFn: ({ signal }) => fetchTopReleases({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzTopRecordings(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "topRecordings", userName, range],
    queryFn: ({ signal }) => fetchTopRecordings({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzListeningActivity(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "listeningActivity", userName, range],
    queryFn: ({ signal }) => fetchListeningActivity({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzDailyActivity(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "dailyActivity", userName, range],
    queryFn: ({ signal }) => fetchDailyActivity({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzEraActivity(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "eraActivity", userName, range],
    queryFn: ({ signal }) => fetchEraActivity({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzGenreActivity(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "genreActivity", userName, range],
    queryFn: ({ signal }) => fetchGenreActivity({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzArtistCountries(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "artistCountries", userName, range],
    queryFn: ({ signal }) => fetchArtistCountries({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzArtistEvolution(
  range: StatsRange,
  { enabled = true } = {},
) {
  const { userName, isEnabled } = useStatsEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "artistEvolution", userName, range],
    queryFn: ({ signal }) => fetchArtistEvolution({ range, signal }),
    enabled: isEnabled,
    staleTime: STATS_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}
