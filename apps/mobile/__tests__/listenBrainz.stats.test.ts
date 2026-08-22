// Mock MMKV-backed storage with an in-memory implementation
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
  currentAuthScope: () => "scope",
}));

// The axios instance itself is stubbed rather than the axios module: the real
// one registers a request interceptor at import time, which a bare stub has no
// way to accept.
jest.mock("@/services/listenBrainz", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import listenBrainzApiInstance from "@/services/listenBrainz";
import {
  fetchDailyActivity,
  fetchListenCount,
  fetchListeningActivity,
  fetchTopArtists,
  fetchTopRecordings,
  fetchTopReleases,
} from "@/services/listenBrainz/stats";
import {
  caaThumbUrl,
  intensityBucket,
  toActivityBuckets,
  toArtistCountries,
  toArtistEvolution,
  toDecadeBuckets,
  toGenreGrid,
  toHeatmapGrid,
} from "@/services/listenBrainz/statsMappers";
import type {
  ArtistEvolutionPayload,
  ArtistMapPayload,
  DailyActivityPayload,
  EraActivityPayload,
  GenreActivityPayload,
  ListeningActivityPayload,
} from "@/services/listenBrainz/types";
import { useListenBrainzBase } from "@/stores/listenBrainz";

const getMock = listenBrainzApiInstance.get as jest.Mock;

const ok = (payload: unknown) => ({ status: 200, data: { payload } });
// What axios hands back for 204: the body is an empty *string*, not an object,
// so anything that reaches for `.payload` on it throws.
const noContent = { status: 204, data: "" };

beforeEach(() => {
  getMock.mockReset();
  useListenBrainzBase.setState({ token: "token", userName: "joel" });
});

describe("stats fetchers: 204 handling", () => {
  const cases: [string, () => Promise<{ state: string }>][] = [
    ["topArtists", () => fetchTopArtists({ range: "week" })],
    ["topReleases", () => fetchTopReleases({ range: "week" })],
    ["topRecordings", () => fetchTopRecordings({ range: "week" })],
    ["listeningActivity", () => fetchListeningActivity({ range: "week" })],
    ["dailyActivity", () => fetchDailyActivity({ range: "week" })],
  ];

  it.each(cases)("maps a 204 from %s to notComputed", async (_name, call) => {
    getMock.mockResolvedValue(noContent);
    await expect(call()).resolves.toEqual({ state: "notComputed" });
  });

  it("treats a 200 with no payload as notComputed", async () => {
    getMock.mockResolvedValue({ status: 200, data: {} });
    await expect(fetchTopArtists({ range: "year" })).resolves.toEqual({
      state: "notComputed",
    });
  });
});

describe("stats fetchers: mapping", () => {
  it("maps top artists and carries last_updated through", async () => {
    getMock.mockResolvedValue(
      ok({
        last_updated: 1783443018,
        artists: [
          {
            artist_name: "Richard Thompson",
            artist_mbid: "mb-1",
            listen_count: 42,
          },
          { artist_name: "Anon", listen_count: 7 },
        ],
      }),
    );

    const result = await fetchTopArtists({ range: "all_time" });

    expect(result).toEqual({
      state: "ready",
      lastUpdated: 1783443018,
      data: [
        { key: "mb-1", rank: 1, title: "Richard Thompson", listenCount: 42 },
        { key: "Anon-1", rank: 2, title: "Anon", listenCount: 7 },
      ],
    });
  });

  it("builds cover art for releases that carry Cover Art Archive fields", async () => {
    getMock.mockResolvedValue(
      ok({
        last_updated: 1,
        releases: [
          {
            release_name: "Silent Geometry",
            artist_name: "Abakus",
            listen_count: 1489,
            release_mbid: "rel-1",
            caa_id: 3984827641,
            caa_release_mbid: "caa-1",
          },
          {
            release_name: "Uncovered",
            artist_name: "Nobody",
            listen_count: 3,
            release_mbid: "rel-2",
          },
        ],
      }),
    );

    const result = await fetchTopReleases({ range: "year" });
    if (result.state !== "ready") throw new Error("expected ready");

    expect(result.data[0].artworkUrl).toBe(
      "https://archive.org/download/mbid-caa-1/mbid-caa-1-3984827641_thumb250.jpg",
    );
    expect(result.data[0].subtitle).toBe("Abakus");
    expect(result.data[1].artworkUrl).toBeUndefined();
  });

  it("maps recordings to title/subtitle", async () => {
    getMock.mockResolvedValue(
      ok({
        last_updated: 1,
        recordings: [
          {
            track_name: "Finally Moving",
            artist_name: "Pretty Lights",
            recording_mbid: "rec-1",
            listen_count: 227,
          },
        ],
      }),
    );

    const result = await fetchTopRecordings({ range: "month" });
    if (result.state !== "ready") throw new Error("expected ready");

    expect(result.data[0]).toMatchObject({
      key: "rec-1",
      rank: 1,
      title: "Finally Moving",
      subtitle: "Pretty Lights",
      listenCount: 227,
    });
  });

  it("requests the range and a bounded count, and escapes the user name", async () => {
    useListenBrainzBase.setState({ userName: "joe mercier" });
    getMock.mockResolvedValue(noContent);

    await fetchTopArtists({ range: "week" });

    expect(getMock).toHaveBeenCalledWith(
      "/1/stats/user/joe%20mercier/artists",
      expect.objectContaining({
        params: expect.objectContaining({ range: "week", count: 10 }),
      }),
    );
  });

  it("refuses to build a request when no account is connected", async () => {
    useListenBrainzBase.setState({ token: "", userName: null });
    await expect(fetchTopArtists({ range: "week" })).rejects.toThrow(
      "not connected",
    );
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("fetchListenCount", () => {
  it("reads the live count", async () => {
    getMock.mockResolvedValue(ok({ count: 12483 }));
    await expect(fetchListenCount()).resolves.toBe(12483);
  });

  it("falls back to zero rather than undefined", async () => {
    getMock.mockResolvedValue({ status: 200, data: {} });
    await expect(fetchListenCount()).resolves.toBe(0);
  });
});

describe("caaThumbUrl", () => {
  it("needs both coordinates", () => {
    expect(caaThumbUrl(undefined, "mbid")).toBeUndefined();
    expect(caaThumbUrl(123, undefined)).toBeUndefined();
    expect(caaThumbUrl(0, "mbid")).toBeUndefined();
    expect(caaThumbUrl(123, "mbid")).toBe(
      "https://archive.org/download/mbid-mbid/mbid-mbid-123_thumb250.jpg",
    );
  });
});

describe("toActivityBuckets", () => {
  const payload = (counts: number[]): ListeningActivityPayload =>
    ({
      listening_activity: counts.map((listen_count, index) => ({
        from_ts: 1000 + index,
        to_ts: 1000 + index,
        listen_count,
        time_range: `b${index}`,
      })),
    }) as ListeningActivityPayload;

  it("trims leading and trailing empty buckets but keeps interior ones", () => {
    // The docs claim all_time only returns years with listens; it does not, so
    // an untrimmed chart opens with a long flat runway back to 2002.
    expect(toActivityBuckets(payload([0, 0, 5, 0, 3, 0, 0]))).toEqual([
      { key: "1002", fromTs: 1002, count: 5 },
      { key: "1003", fromTs: 1003, count: 0 },
      { key: "1004", fromTs: 1004, count: 3 },
    ]);
  });

  it("carries the period start, not the API's English label", () => {
    // The label is rebuilt from this in the app's locale, so the bucket must
    // keep the timestamp rather than "Monday 13 July 2026".
    const [bucket] = toActivityBuckets(payload([4]));
    expect(bucket).not.toHaveProperty("label");
    expect(bucket.fromTs).toBe(1000);
  });

  it("returns nothing when every bucket is empty", () => {
    expect(toActivityBuckets(payload([0, 0, 0]))).toEqual([]);
  });

  it("drops a bucket with no start rather than dating it", () => {
    // The chart formats fromTs as a date; an undefined one throws a RangeError
    // out of date-fns and takes the whole screen with it.
    const buckets = toActivityBuckets({
      listening_activity: [
        { listen_count: 5, time_range: "whenever" },
        { from_ts: 1000, to_ts: 1099, listen_count: 3, time_range: "b" },
      ],
    } as unknown as ListeningActivityPayload);

    expect(buckets).toEqual([{ key: "1000", fromTs: 1000, count: 3 }]);
  });
});

describe("toDecadeBuckets", () => {
  const payload = (years: [number, number][]): EraActivityPayload =>
    ({
      era_activity: years.map(([year, listen_count]) => ({
        year,
        listen_count,
      })),
    }) as EraActivityPayload;

  it("sums release years into decades", () => {
    expect(
      toDecadeBuckets(
        payload([
          [1991, 3],
          [1995, 4],
          [2001, 5],
        ]),
      ),
    ).toEqual([
      { key: "1990", decade: 1990, count: 7 },
      { key: "2000", decade: 2000, count: 5 },
    ]);
  });

  it("fills the decades in between rather than closing the gap", () => {
    // Only years with listens come back, so 1970 → 2000 arrives as two rows;
    // eliding the gap would put the 1970s next to the 2000s on the axis.
    expect(
      toDecadeBuckets(
        payload([
          [1971, 2],
          [2003, 6],
        ]),
      ).map((b) => b.count),
    ).toEqual([2, 0, 0, 6]);
  });

  it("returns nothing for an empty response", () => {
    expect(toDecadeBuckets(payload([]))).toEqual([]);
  });
});

describe("toGenreGrid", () => {
  const payload = (entries: [string, number, number][]): GenreActivityPayload =>
    ({
      genre_activity: entries.map(([genre, hour, listen_count]) => ({
        genre,
        hour,
        listen_count,
      })),
    }) as GenreActivityPayload;

  it("builds a full 24-hour row from a sparse response", () => {
    const grid = toGenreGrid(
      payload([
        ["jazz", 3, 5],
        ["jazz", 20, 2],
      ]),
    );

    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].key).toBe("jazz");
    expect(grid.rows[0].hours).toHaveLength(24);
    expect(grid.rows[0].hours[3]).toBe(5);
    expect(grid.rows[0].hours[20]).toBe(2);
    expect(grid.max).toBe(5);
  });

  it("ranks genres by their daily total, not by arrival order", () => {
    const grid = toGenreGrid(
      payload([
        ["ambient", 1, 3],
        ["metal", 2, 2],
        ["metal", 3, 9],
      ]),
    );

    expect(grid.rows.map((row) => row.key)).toEqual(["metal", "ambient"]);
  });

  it("drops hours outside the day rather than shifting the row", () => {
    const grid = toGenreGrid(
      payload([
        ["pop", 0, 1],
        ["pop", 24, 99],
      ]),
    );

    expect(grid.rows[0].hours).toHaveLength(24);
    expect(grid.max).toBe(1);
  });
});

describe("toHeatmapGrid", () => {
  it("always yields a Monday-first 7x24 grid, even from a sparse response", () => {
    const grid = toHeatmapGrid({
      daily_activity: {
        Monday: [{ hour: 3, listen_count: 9 }],
        Friday: [
          { hour: 0, listen_count: 4 },
          { hour: 99, listen_count: 1000 },
        ],
      },
    } as unknown as DailyActivityPayload);

    expect(grid.rows).toHaveLength(7);
    expect(grid.rows.map((row) => row.key)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    for (const row of grid.rows) expect(row.hours).toHaveLength(24);
    expect(grid.rows[0].hours[3]).toBe(9);
    expect(grid.rows[1].hours.every((hour) => hour === 0)).toBe(true);
    expect(grid.rows[4].hours[0]).toBe(4);
    // An out-of-range hour is dropped rather than shifting the row.
    expect(grid.max).toBe(9);
  });
});

describe("toArtistCountries", () => {
  const payload = (entries: [string, number, number][]): ArtistMapPayload =>
    ({
      artist_map: entries.map(([country, artist_count, listen_count]) => ({
        country,
        artist_count,
        listen_count,
      })),
    }) as ArtistMapPayload;

  it("ranks by listens, not by how many artists a country has", () => {
    const countries = toArtistCountries(
      payload([
        ["SWE", 8, 12],
        ["USA", 1, 800],
      ]),
    );

    expect(countries.map((c) => [c.code, c.rank])).toEqual([
      ["USA", 1],
      ["SWE", 2],
    ]);
    expect(countries[0].artistCount).toBe(1);
  });

  it("caps the list", () => {
    const entries = Array.from(
      { length: 40 },
      (_, index) => [`C${index}`, 1, index] as [string, number, number],
    );
    expect(toArtistCountries(payload(entries))).toHaveLength(10);
  });
});

describe("toArtistEvolution", () => {
  const payload = (
    entries: [string, string, number][],
  ): ArtistEvolutionPayload =>
    ({
      artist_evolution_activity: entries.map(
        ([artist_name, time_unit, listen_count]) => ({
          artist_name,
          time_unit,
          listen_count,
        }),
      ),
    }) as ArtistEvolutionPayload;

  it("orders weekday units by the week, not alphabetically", () => {
    const { units } = toArtistEvolution(
      payload([
        ["A", "Friday", 1],
        ["A", "Monday", 2],
      ]),
      "week",
    );

    // A full week, so an artist's shape is read against the same axis whichever
    // days they happen to have listens on.
    expect(units).toHaveLength(7);
    expect(units.map((unit) => unit.sort)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(units[0].values[0]).toBe(2);
    expect(units[4].values[0]).toBe(1);
  });

  it("orders month-name units by the calendar", () => {
    const { units } = toArtistEvolution(
      payload([
        ["A", "April", 1],
        ["A", "January", 5],
      ]),
      "year",
    );

    expect(units).toHaveLength(12);
    expect(units[0].values[0]).toBe(5);
    expect(units[3].values[0]).toBe(1);
  });

  it("spans every year between the first and last, for all time", () => {
    const { units } = toArtistEvolution(
      payload([
        ["A", "2020", 3],
        ["A", "2023", 4],
      ]),
      "all_time",
    );

    expect(units.map((unit) => unit.sort)).toEqual([2020, 2021, 2022, 2023]);
  });

  it("pools everyone past the top six into one band", () => {
    const entries: [string, string, number][] = Array.from(
      { length: 9 },
      (_, index) => [`artist-${index}`, "2020", 100 - index],
    );

    const { series, units } = toArtistEvolution(payload(entries), "all_time");

    expect(series).toHaveLength(7);
    expect(series.slice(0, 6).map((one) => one.key)).toEqual([
      "artist-0",
      "artist-1",
      "artist-2",
      "artist-3",
      "artist-4",
      "artist-5",
    ]);
    expect(series[6].isOther).toBe(true);
    // 94 + 93 + 92, the three that did not get their own band.
    expect(series[6].total).toBe(279);
    expect(units[0].values[6]).toBe(279);
  });

  it("drops a unit it cannot place rather than sorting it to the front", () => {
    const { units } = toArtistEvolution(
      payload([
        ["A", "Someday", 9],
        ["A", "Tuesday", 1],
      ]),
      "week",
    );

    expect(units.reduce((sum, unit) => sum + unit.values[0], 0)).toBe(1);
  });

  it("has nothing to draw for an empty response", () => {
    expect(toArtistEvolution(payload([]), "year")).toEqual({
      series: [],
      units: [],
    });
  });
});

describe("intensityBucket", () => {
  it("reserves level 0 for a genuinely empty cell", () => {
    expect(intensityBucket(0, 100)).toBe(0);
    expect(intensityBucket(1, 100)).toBe(1);
  });

  it("never exceeds the top level", () => {
    expect(intensityBucket(100, 100)).toBe(4);
    expect(intensityBucket(200, 100)).toBe(4);
  });

  it("degrades safely when there is no maximum", () => {
    expect(intensityBucket(5, 0)).toBe(0);
  });
});
