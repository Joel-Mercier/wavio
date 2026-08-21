import type {
  ArtistEvolutionPayload,
  ArtistMapPayload,
  DailyActivityPayload,
  EraActivityPayload,
  GenreActivityPayload,
  ListeningActivityPayload,
  StatsRange,
  TopArtistsPayload,
  TopRecordingsPayload,
  TopReleasesPayload,
} from "@/services/listenBrainz/types";

// View models for the stats screen. Deliberately shaped for rendering rather
// than mirroring the wire: the three "top" endpoints differ only in which field
// names carry the title and subtitle, so they collapse into one row type and
// one list component.

export type TopStatItem = {
  key: string;
  rank: number;
  title: string;
  subtitle?: string;
  listenCount: number;
  artworkUrl?: string;
};

/**
 * A bar of the activity chart.
 *
 * It carries the period's start rather than the API's `time_range` label
 * ("Monday 13 July 2026", "01 May 2026", "2002"): those are English, whatever
 * the app's locale, so the axis is formatted from the timestamp by the
 * component — which also re-renders when the locale changes, as a label baked
 * into a cached query result would not.
 */
export type ActivityBucket = {
  key: string;
  fromTs: number;
  count: number;
};

// Music by decade. `decade` is the first year of it (1990 → "1990s"); the
// suffix is a translated string, so the label itself is left to the component.
export type DecadeBucket = {
  key: string;
  decade: number;
  count: number;
};

export type HeatmapRow = {
  // Identifies the row and, for genres, labels it. Weekday rows are keyed by
  // the English name the API uses and labelled by the component from their
  // position, which is always Monday-first.
  key: string;
  hours: number[];
};

export type HeatmapGrid = {
  rows: HeatmapRow[];
  max: number;
};

// One country's artists. The name is left as the API's alpha-3 code: turning it
// into words is the platform's job (utils/countries) and depends on the locale.
export type CountryStat = {
  key: string;
  rank: number;
  code: string;
  artistCount: number;
  listenCount: number;
};

/**
 * Artists over time, as a stack per period.
 *
 * `values` runs parallel to `series` so a column is read straight down the same
 * index — which is also what keeps a colour attached to an artist across every
 * period, rather than to whatever happened to rank third that week.
 */
export type EvolutionSeries = {
  // The artist's name, which is also its label — except for the pooled band,
  // whose name is a translated string the component supplies.
  key: string;
  total: number;
  isOther?: boolean;
};

export type EvolutionUnit = {
  key: string;
  // Position within the range's cycle: weekday index, day of month, month
  // index, or the year itself. The axis label is formatted from this.
  sort: number;
  values: number[];
};

export type ArtistEvolution = {
  series: EvolutionSeries[];
  units: EvolutionUnit[];
};

export const HEATMAP_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const HOURS_PER_DAY = 24;

/**
 * Cover Art Archive thumbnail for a release. Both coordinates are needed to
 * build the URL and neither is part of the documented response, so a missing
 * one yields no URL at all rather than a guess — callers render their fallback.
 */
export function caaThumbUrl(
  caaId?: number,
  caaReleaseMbid?: string,
): string | undefined {
  if (!caaId || !caaReleaseMbid) return undefined;
  return `https://archive.org/download/mbid-${caaReleaseMbid}/mbid-${caaReleaseMbid}-${caaId}_thumb250.jpg`;
}

export function toTopArtists(payload: TopArtistsPayload): TopStatItem[] {
  return (payload.artists ?? []).map((artist, index) => ({
    key: artist.artist_mbid || `${artist.artist_name}-${index}`,
    rank: index + 1,
    title: artist.artist_name,
    listenCount: artist.listen_count,
  }));
}

export function toTopReleases(payload: TopReleasesPayload): TopStatItem[] {
  return (payload.releases ?? []).map((release, index) => ({
    key: release.release_mbid || `${release.release_name}-${index}`,
    rank: index + 1,
    title: release.release_name,
    subtitle: release.artist_name,
    listenCount: release.listen_count,
    artworkUrl: caaThumbUrl(release.caa_id, release.caa_release_mbid),
  }));
}

export function toTopRecordings(payload: TopRecordingsPayload): TopStatItem[] {
  return (payload.recordings ?? []).map((recording, index) => ({
    key: recording.recording_mbid || `${recording.track_name}-${index}`,
    rank: index + 1,
    title: recording.track_name,
    subtitle: recording.artist_name,
    listenCount: recording.listen_count,
    artworkUrl: caaThumbUrl(recording.caa_id, recording.caa_release_mbid),
  }));
}

/**
 * Listening activity as chart buckets.
 *
 * Empty buckets at either end are dropped: the docs claim `all_time` only
 * returns years with listens, but it actually returns every year since 2002,
 * which would render as a long flat runway before the first real bar. Interior
 * zeros are kept — a quiet year between two busy ones is part of the shape.
 */
export function toActivityBuckets(
  payload: ListeningActivityPayload,
): ActivityBucket[] {
  // A bucket with no start is dropped rather than kept with a placeholder: the
  // chart turns this into a date, and an unusable one takes the screen down.
  const buckets = (payload.listening_activity ?? [])
    .filter((entry) => Number.isFinite(entry.from_ts))
    .map((entry) => ({
      key: String(entry.from_ts),
      fromTs: entry.from_ts,
      count: entry.listen_count ?? 0,
    }));
  const first = buckets.findIndex((bucket) => bucket.count > 0);
  if (first === -1) return [];
  let last = buckets.length - 1;
  while (last > first && buckets[last].count === 0) last--;
  return buckets.slice(first, last + 1);
}

/**
 * Daily activity as a fixed Monday-first 7×24 grid.
 *
 * The response is rebuilt rather than read positionally: weekday keys can be
 * missing and hour arrays can be short or out of order, and a grid with holes
 * in it would misalign every column after the gap.
 */
export function toHeatmapGrid(payload: DailyActivityPayload): HeatmapGrid {
  let max = 0;
  const rows = HEATMAP_WEEKDAYS.map((weekday) => {
    const hours = new Array<number>(HOURS_PER_DAY).fill(0);
    for (const entry of payload.daily_activity?.[weekday] ?? []) {
      if (entry.hour < 0 || entry.hour >= HOURS_PER_DAY) continue;
      const count = entry.listen_count ?? 0;
      hours[entry.hour] = count;
      if (count > max) max = count;
    }
    return { key: weekday, hours };
  });
  return { rows, max };
}

/**
 * Guards the gap-filling below: MusicBrainz release dates include mistyped
 * outliers (year 0, five-digit years), and a single one of those would turn the
 * range between the real decades into thousands of empty buckets.
 */
function isPlausibleReleaseYear(year: number): boolean {
  return (
    Number.isFinite(year) &&
    year >= 1850 &&
    year <= new Date().getFullYear() + 1
  );
}

/**
 * Release years collapsed into decades.
 *
 * Only years with listens come back, so the decades between two of them are
 * filled in as empty rather than closed up: a gap is a real feature of a
 * collection's shape, and eliding it would put the 1960s next to the 2010s.
 */
export function toDecadeBuckets(payload: EraActivityPayload): DecadeBucket[] {
  const totals = new Map<number, number>();
  for (const entry of payload.era_activity ?? []) {
    if (!isPlausibleReleaseYear(entry.year)) continue;
    const decade = Math.floor(entry.year / 10) * 10;
    totals.set(decade, (totals.get(decade) ?? 0) + (entry.listen_count ?? 0));
  }
  const decades = [...totals.keys()].sort((a, b) => a - b);
  if (!decades.length) return [];

  const buckets: DecadeBucket[] = [];
  for (
    let decade = decades[0];
    decade <= decades[decades.length - 1];
    decade += 10
  ) {
    buckets.push({
      key: String(decade),
      decade,
      count: totals.get(decade) ?? 0,
    });
  }
  return buckets;
}

// Genres shown at once. The API returns everything it knows about, which for a
// broad collection is 30-odd rows — far past what fits on a phone, and past the
// point where the rows still say anything.
const GENRE_ROWS = 8;

/**
 * Genre activity as a genre × hour grid, busiest genres first.
 *
 * The response is sparse — one entry per (genre, hour) pair that has listens —
 * so every row is built full-width and filled in, and genres are ranked by
 * their daily total rather than by the order they arrive in.
 */
export function toGenreGrid(payload: GenreActivityPayload): HeatmapGrid {
  const byGenre = new Map<string, number[]>();
  for (const entry of payload.genre_activity ?? []) {
    if (entry.hour < 0 || entry.hour >= HOURS_PER_DAY) continue;
    const hours =
      byGenre.get(entry.genre) ?? new Array<number>(HOURS_PER_DAY).fill(0);
    hours[entry.hour] += entry.listen_count ?? 0;
    byGenre.set(entry.genre, hours);
  }

  const total = (hours: number[]) => hours.reduce((sum, n) => sum + n, 0);
  const rows = [...byGenre.entries()]
    .sort(([, a], [, b]) => total(b) - total(a))
    .slice(0, GENRE_ROWS)
    .map(([genre, hours]) => ({ key: genre, hours }));

  const max = rows.reduce((peak, row) => Math.max(peak, ...row.hours), 0);
  return { rows, max };
}

// Countries listed at once. Past this the tail is one-artist countries, which
// say more about a stray listen than about where the music comes from.
const COUNTRY_ROWS = 10;

/**
 * Artist origins, most-listened country first.
 *
 * Ranked by listens rather than by how many distinct artists a country has:
 * one artist played 800 times says more about what you listen to than eight
 * played once, and the artist count is carried along to be shown beside it.
 */
export function toArtistCountries(payload: ArtistMapPayload): CountryStat[] {
  return (payload.artist_map ?? [])
    .filter((entry) => !!entry.country)
    .sort((a, b) => (b.listen_count ?? 0) - (a.listen_count ?? 0))
    .slice(0, COUNTRY_ROWS)
    .map((entry, index) => ({
      key: entry.country,
      rank: index + 1,
      code: entry.country,
      artistCount: entry.artist_count ?? 0,
      listenCount: entry.listen_count ?? 0,
    }));
}

// Artists drawn as their own band; everyone else is summed into one. Eight
// series is the point where a stack stops being readable, and the palette a
// colour-blind reader can separate does not run much further either.
const EVOLUTION_SERIES = 6;
const OTHER_SERIES_KEY = "__other";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Reads a `time_unit` label into a sortable position.
 *
 * The API returns a different kind of label per range and in no useful order —
 * "Friday", "23", "April", "2016" — so each range parses its own, and anything
 * unrecognised is dropped rather than sorted to the front as a zero.
 */
function unitSort(unit: string, range: StatsRange): number | undefined {
  if (range === "week") {
    const index = HEATMAP_WEEKDAYS.indexOf(
      unit as (typeof HEATMAP_WEEKDAYS)[number],
    );
    return index === -1 ? undefined : index;
  }
  if (range === "year") {
    const index = MONTH_NAMES.indexOf(unit as (typeof MONTH_NAMES)[number]);
    return index === -1 ? undefined : index;
  }
  const value = Number(unit);
  return Number.isFinite(value) ? value : undefined;
}

// The full cycle a range runs over, so the axis is the week (or the month, or
// the year) rather than only the parts of it that happen to have listens.
function unitDomain(range: StatsRange, present: number[]): number[] {
  if (range === "week") return [0, 1, 2, 3, 4, 5, 6];
  if (range === "year") return [...MONTH_NAMES.keys()];
  if (range === "month")
    return Array.from({ length: 31 }, (_, index) => index + 1);
  if (!present.length) return [];
  const from = Math.min(...present);
  const to = Math.max(...present);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function toArtistEvolution(
  payload: ArtistEvolutionPayload,
  range: StatsRange,
): ArtistEvolution {
  const entries = (payload.artist_evolution_activity ?? [])
    .map((entry) => ({ ...entry, sort: unitSort(entry.time_unit, range) }))
    .filter((entry) => entry.sort !== undefined);
  if (!entries.length) return { series: [], units: [] };

  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(
      entry.artist_name,
      (totals.get(entry.artist_name) ?? 0) + (entry.listen_count ?? 0),
    );
  }
  const ranked = [...totals.entries()].sort(([, a], [, b]) => b - a);
  const named = ranked.slice(0, EVOLUTION_SERIES);
  const otherTotal = ranked
    .slice(EVOLUTION_SERIES)
    .reduce((sum, [, total]) => sum + total, 0);

  const series: EvolutionSeries[] = named.map(([name, total]) => ({
    key: name,
    total,
  }));
  if (otherTotal > 0) {
    series.push({ key: OTHER_SERIES_KEY, total: otherTotal, isOther: true });
  }

  const seriesIndex = new Map(series.map((one, index) => [one.key, index]));
  const otherIndex = otherTotal > 0 ? series.length - 1 : undefined;
  const byUnit = new Map<number, number[]>();
  for (const entry of entries) {
    const sort = entry.sort as number;
    const values = byUnit.get(sort) ?? new Array<number>(series.length).fill(0);
    const index = seriesIndex.get(entry.artist_name) ?? otherIndex;
    if (index !== undefined) values[index] += entry.listen_count ?? 0;
    byUnit.set(sort, values);
  }

  const units = unitDomain(range, [...byUnit.keys()]).map((sort) => ({
    key: String(sort),
    sort,
    values: byUnit.get(sort) ?? new Array<number>(series.length).fill(0),
  }));

  return { series, units };
}

/**
 * Colour step for a heatmap cube, on GitHub's five-level scale. Level 0 is
 * reserved for "nothing at all" so a quiet hour never looks like an empty one.
 */
export function intensityBucket(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4)) as 1 | 2 | 3 | 4;
}
