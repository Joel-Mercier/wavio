import type { AxiosResponse } from "axios";
import listenBrainzApiInstance from "@/services/listenBrainz";
import {
  type ActivityBucket,
  type ArtistEvolution,
  type CountryStat,
  type DecadeBucket,
  type HeatmapGrid,
  type TopStatItem,
  toActivityBuckets,
  toArtistCountries,
  toArtistEvolution,
  toDecadeBuckets,
  toGenreGrid,
  toHeatmapGrid,
  toTopArtists,
  toTopRecordings,
  toTopReleases,
} from "@/services/listenBrainz/statsMappers";
import type {
  ArtistEvolutionPayload,
  ArtistMapPayload,
  DailyActivityPayload,
  EraActivityPayload,
  GenreActivityPayload,
  ListenCountPayload,
  ListeningActivityPayload,
  StatsRange,
  StatsResponse,
  TopArtistsPayload,
  TopRecordingsPayload,
  TopReleasesPayload,
} from "@/services/listenBrainz/types";
import { requireUserName } from "@/services/listenBrainz/user";

// How many rows each "top" list asks for. The screen shows a glanceable top
// slice, not a browsable chart, so this stays well under the API's own cap.
export const TOP_STATS_COUNT = 10;

/**
 * A statistic that may not exist yet.
 *
 * ListenBrainz computes these in a batch job, and until it has run for a given
 * user *and* range the endpoint answers `204 No Content`. That is a routine
 * state, not a failure and not an empty result — a heavily-used account still
 * gets a 204 for `week` while `year` returns data — so it is modelled
 * explicitly rather than collapsed into `null`, which callers would inevitably
 * render as "no listens".
 */
export type StatsResult<T> =
  | { state: "ready"; data: T; lastUpdated: number | null }
  | { state: "notComputed" };

const NOT_COMPUTED = { state: "notComputed" } as const;

/**
 * Unwraps a stats response, mapping its payload only once there is one.
 *
 * A 204 arrives at axios as `data: ""` — an empty *string*, not an object — so
 * reaching for `data.payload` on it throws a TypeError rather than producing
 * the empty result you might expect. Both the status and the body shape are
 * checked, because a proxy in front of a self-hosted instance may normalise one
 * but not the other.
 */
function unwrap<P extends { last_updated?: number }, T>(
  response: AxiosResponse<StatsResponse<P> | "">,
  map: (payload: P) => T,
): StatsResult<T> {
  const body = response.data;
  if (response.status === 204 || !body || typeof body !== "object") {
    return NOT_COMPUTED;
  }
  const payload = body.payload;
  if (!payload) return NOT_COMPUTED;
  return {
    state: "ready",
    data: map(payload),
    lastUpdated:
      typeof payload.last_updated === "number" ? payload.last_updated : null,
  };
}

type RangeOptions = { range: StatsRange; signal?: AbortSignal };

// Each statistic is its own endpoint, named by the last segment of its path.
type StatsEndpoint =
  | "artists"
  | "releases"
  | "recordings"
  | "listening-activity"
  | "daily-activity"
  | "era-activity"
  | "genre-activity"
  | "artist-map"
  | "artist-evolution-activity";

/**
 * One statistics request. The endpoints differ only in that last path segment
 * and in whether they take a `count`.
 */
function getStats<P>(
  endpoint: StatsEndpoint,
  range: StatsRange,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<AxiosResponse<StatsResponse<P> | "">> {
  return listenBrainzApiInstance.get<StatsResponse<P> | "">(
    `/1/stats/user/${requireUserName()}/${endpoint}`,
    { params: { range, ...params }, signal },
  );
}

export const fetchTopArtists = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<TopStatItem[]>> =>
  unwrap(
    await getStats<TopArtistsPayload>(
      "artists",
      range,
      { count: TOP_STATS_COUNT },
      signal,
    ),
    toTopArtists,
  );

export const fetchTopReleases = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<TopStatItem[]>> =>
  unwrap(
    await getStats<TopReleasesPayload>(
      "releases",
      range,
      { count: TOP_STATS_COUNT },
      signal,
    ),
    toTopReleases,
  );

export const fetchTopRecordings = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<TopStatItem[]>> =>
  unwrap(
    await getStats<TopRecordingsPayload>(
      "recordings",
      range,
      { count: TOP_STATS_COUNT },
      signal,
    ),
    toTopRecordings,
  );

export const fetchListeningActivity = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<ActivityBucket[]>> =>
  unwrap(
    await getStats<ListeningActivityPayload>(
      "listening-activity",
      range,
      {},
      signal,
    ),
    toActivityBuckets,
  );

export const fetchDailyActivity = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<HeatmapGrid>> =>
  unwrap(
    await getStats<DailyActivityPayload>("daily-activity", range, {}, signal),
    toHeatmapGrid,
  );

export const fetchEraActivity = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<DecadeBucket[]>> =>
  unwrap(
    await getStats<EraActivityPayload>("era-activity", range, {}, signal),
    toDecadeBuckets,
  );

export const fetchGenreActivity = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<HeatmapGrid>> =>
  unwrap(
    await getStats<GenreActivityPayload>("genre-activity", range, {}, signal),
    toGenreGrid,
  );

export const fetchArtistCountries = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<CountryStat[]>> =>
  unwrap(
    await getStats<ArtistMapPayload>("artist-map", range, {}, signal),
    toArtistCountries,
  );

// The only statistic whose mapping depends on the range: `time_unit` is a
// weekday for one range and a year for another, and only the caller knows which.
export const fetchArtistEvolution = async ({
  range,
  signal,
}: RangeOptions): Promise<StatsResult<ArtistEvolution>> =>
  unwrap(
    await getStats<ArtistEvolutionPayload>(
      "artist-evolution-activity",
      range,
      {},
      signal,
    ),
    (payload) => toArtistEvolution(payload, range),
  );

/**
 * Total listens. Read straight from the database rather than the batch-computed
 * statistics, so it answers immediately for an account whose stats don't exist
 * yet — which is what keeps a freshly connected screen from looking broken.
 */
export const fetchListenCount = async (options?: {
  signal?: AbortSignal;
}): Promise<number> => {
  const rsp = await listenBrainzApiInstance.get<
    StatsResponse<ListenCountPayload>
  >(`/1/user/${requireUserName()}/listen-count`, { signal: options?.signal });
  return rsp.data?.payload?.count ?? 0;
};
