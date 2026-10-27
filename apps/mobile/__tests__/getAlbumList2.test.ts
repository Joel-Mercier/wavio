// The album browse is paginated, so its order goes into the backend call. Every
// backend implements the same Subsonic album-list `type` enum, but only some of
// them take a *direction* — Subsonic's getAlbumList2 has no sort-order
// parameter, so there only `byYear` reverses (by swapping the year bounds).
const mockFolderScopedRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockNavidromeGet = jest.fn();
const mockQueryAlbums = jest.fn();

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

jest.mock("@/services/openSubsonic", () => ({
  __esModule: true,
  default: {},
  subsonicRequest: jest.fn(),
  folderScopedRequest: (...args: unknown[]) => mockFolderScopedRequest(...args),
  okEnvelope: (payload: object) => ({ status: "ok", ...payload }),
}));

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockJellyfinGet(...args) },
  getDeviceId: () => "device",
  userId: () => "user",
}));

jest.mock("@/services/navidrome", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockNavidromeGet(...args) },
}));

jest.mock("@/services/local/repository", () => ({
  queryAlbums: (...args: unknown[]) => mockQueryAlbums(...args),
  queryAlbumByKey: jest.fn(),
  queryArtistByKey: jest.fn(),
  querySongs: jest.fn(),
  queryTopSongs: jest.fn(),
  queryTrackById: jest.fn(),
  searchTracks: jest.fn(),
}));

jest.mock("@/services/local/mappers", () => ({
  mapAggToAlbum: (row: { album_key: string }) => ({ id: row.album_key }),
  mapAggToArtist: jest.fn(),
  mapRowToChild: jest.fn(),
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToAlbum: (item: {
    Id: string;
    UserData?: { PlayCount?: number; LastPlayedDate?: string };
  }) => ({
    id: item.Id,
    playCount: item.UserData?.PlayCount,
    played: item.UserData?.LastPlayedDate,
  }),
  mapBaseItemToChild: jest.fn(),
  mapBaseItemToArtist: jest.fn(),
  COMMON_FIELDS: "",
}));

import axios from "axios";
import { getAlbumList2 as backendGetAlbumList2 } from "@/services/backend/lists";
import {
  __resetAlbumPlayStats,
  __resetLatestUnsupported,
  getRandomAlbumsWithPlayCounts,
  getAlbumList2 as jellyfinGetAlbumList2,
} from "@/services/jellyfin/lists";
import { getAlbumList2 as localGetAlbumList2 } from "@/services/local/lists";
import { getAlbumList2 as navidromeGetAlbumList2 } from "@/services/navidrome/albums";
import { getAlbumList2 as subsonicGetAlbumList2 } from "@/services/openSubsonic/lists";
import { useAuthBase } from "@/stores/auth";

beforeEach(() => {
  mockFolderScopedRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockNavidromeGet.mockReset();
  mockQueryAlbums.mockReset();
  __resetLatestUnsupported();
  __resetAlbumPlayStats();
  useAuthBase.setState({ serverId: "jf-1" });
});

describe("subsonic getAlbumList2", () => {
  it("passes the album-list type through untouched", async () => {
    mockFolderScopedRequest.mockResolvedValue({ albumList2: { album: [] } });

    await subsonicGetAlbumList2("alphabeticalByName", { size: 20, offset: 40 });

    const [path, params] = mockFolderScopedRequest.mock.calls[0];
    expect(path).toBe("/rest/getAlbumList2");
    expect(params).toMatchObject({
      type: "alphabeticalByName",
      size: 20,
      offset: 40,
    });
    // getAlbumList2 has no sort-order parameter, so nothing extra is invented.
    expect(params.fromYear).toBeUndefined();
    expect(params.toYear).toBeUndefined();
  });

  // The one direction control the Subsonic surface has: the spec returns
  // reverse chronological order when fromYear is the later of the two bounds.
  it("fills sentinel year bounds for a byYear sort", async () => {
    mockFolderScopedRequest.mockResolvedValue({ albumList2: { album: [] } });

    await subsonicGetAlbumList2("byYear", {});
    expect(mockFolderScopedRequest.mock.calls[0][1]).toMatchObject({
      fromYear: 0,
      toYear: 9999,
    });

    await subsonicGetAlbumList2("byYear", { order: "desc" });
    expect(mockFolderScopedRequest.mock.calls[1][1]).toMatchObject({
      fromYear: 9999,
      toYear: 0,
    });
  });

  it("swaps caller-supplied year bounds rather than replacing them", async () => {
    mockFolderScopedRequest.mockResolvedValue({ albumList2: { album: [] } });

    await subsonicGetAlbumList2("byYear", {
      fromYear: 1990,
      toYear: 1999,
      order: "desc",
    });

    expect(mockFolderScopedRequest.mock.calls[0][1]).toMatchObject({
      fromYear: 1999,
      toYear: 1990,
    });
  });

  // Every other type is stuck with the direction it serves, which is why
  // utils/albumSort locks those rows in the sheet for this backend.
  it("ignores an order it can't honour", async () => {
    mockFolderScopedRequest.mockResolvedValue({ albumList2: { album: [] } });

    await subsonicGetAlbumList2("alphabeticalByName", { order: "desc" });

    expect(
      Object.keys(mockFolderScopedRequest.mock.calls[0][1] as object),
    ).not.toContain("order");
  });
});

describe("jellyfin getAlbumList2", () => {
  it("keeps each type's own SortBy and SortOrder when no order is asked for", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [{ Id: "a" }] } });

    const rsp = await jellyfinGetAlbumList2("alphabeticalByName", { size: 20 });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual(["a"]);
    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      IncludeItemTypes: "MusicAlbum",
      SortBy: "SortName",
      SortOrder: "Ascending",
    });
  });

  it("overrides the direction with the requested order", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetAlbumList2("alphabeticalByName", { order: "desc" });

    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      SortBy: "SortName",
      SortOrder: "Descending",
    });
  });

  // /Users/{id}/Items/Latest is newest-first only, so an ascending "recently
  // added" has to go through /Items like everything else.
  it("skips the Latest fast path for an ascending newest browse", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetAlbumList2("newest", { order: "asc" });

    expect(mockJellyfinGet.mock.calls[0][0]).toBe("/Items");
    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      SortBy: "DateCreated",
      SortOrder: "Ascending",
    });
  });

  it("still uses the Latest fast path for the natural newest browse", async () => {
    mockJellyfinGet.mockResolvedValue({ data: [] });

    await jellyfinGetAlbumList2("newest", {});

    expect(mockJellyfinGet.mock.calls[0][0]).toMatch(/\/Items\/Latest$/);
  });

  it("does not send /Items-only parameters to Latest", async () => {
    // EnableTotalRecordCount has no meaning on a route that returns a bare
    // array, and a strict model binder is entitled to 422 the unknown param.
    mockJellyfinGet.mockResolvedValue({ data: [] });

    await jellyfinGetAlbumList2("newest", {});

    expect(
      mockJellyfinGet.mock.calls[0][1].params.EnableTotalRecordCount,
    ).toBeUndefined();
  });

  // The Latest route is a shortcut some Jellyfin-compatible servers refuse
  // (one answers 422). /Items serves the same albums, so a refusal must cost
  // the "recently added" row nothing.
  describe("when the server refuses Latest", () => {
    const refused = (status: number) => {
      const err = new axios.AxiosError("Unprocessable Entity");
      // biome-ignore lint/suspicious/noExplicitAny: minimal axios response stub
      err.response = { status } as any;
      return err;
    };

    it("falls back to /Items instead of failing the browse", async () => {
      mockJellyfinGet
        .mockRejectedValueOnce(refused(422))
        .mockResolvedValueOnce({ data: { Items: [{ Id: "a" }] } });

      const rsp = await jellyfinGetAlbumList2("newest", {});

      expect(rsp.albumList2.album?.map((album) => album.id)).toEqual(["a"]);
      expect(mockJellyfinGet.mock.calls[1][0]).toBe("/Items");
      expect(mockJellyfinGet.mock.calls[1][1].params).toMatchObject({
        SortBy: "DateCreated",
        SortOrder: "Descending",
      });
    });

    it("stops probing Latest on that server", async () => {
      // What turned this into 57 events in 70 minutes: every home-screen mount
      // re-asked, and React Query retried each one.
      mockJellyfinGet
        .mockRejectedValueOnce(refused(422))
        .mockResolvedValue({ data: { Items: [] } });

      await jellyfinGetAlbumList2("newest", {});
      await jellyfinGetAlbumList2("newest", {});

      expect(mockJellyfinGet).toHaveBeenCalledTimes(3);
      expect(mockJellyfinGet.mock.calls[2][0]).toBe("/Items");
    });

    it("still probes a different server", async () => {
      mockJellyfinGet
        .mockRejectedValueOnce(refused(422))
        .mockResolvedValueOnce({ data: { Items: [] } })
        .mockResolvedValueOnce({ data: [] });
      await jellyfinGetAlbumList2("newest", {});

      useAuthBase.setState({ serverId: "jf-2" });
      await jellyfinGetAlbumList2("newest", {});

      expect(mockJellyfinGet.mock.calls[2][0]).toMatch(/\/Items\/Latest$/);
    });

    it("keeps using Latest when the failure was that nothing answered", async () => {
      // A connection failure says nothing about the route, and /Items would
      // fail identically — so it propagates rather than being remembered as a
      // verdict the server never gave.
      const offline = new axios.AxiosError("Network Error");
      mockJellyfinGet.mockRejectedValueOnce(offline);

      await expect(jellyfinGetAlbumList2("newest", {})).rejects.toBe(offline);
      expect(mockJellyfinGet).toHaveBeenCalledTimes(1);

      mockJellyfinGet.mockResolvedValue({ data: [] });
      await jellyfinGetAlbumList2("newest", {});
      expect(mockJellyfinGet.mock.calls[1][0]).toMatch(/\/Items\/Latest$/);
    });
  });

  // Random has no direction to override.
  it("leaves a random browse alone", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetAlbumList2("random", { order: "desc" });

    const params = mockJellyfinGet.mock.calls[0][1].params;
    expect(params.SortBy).toBe("Random");
    expect(params.SortOrder).toBeUndefined();
  });
});

// Jellyfin never writes an album's own UserData.PlayCount (measured on 12.2:
// 0 on every album with 26 played tracks), so the least-played pool sums it.
describe("jellyfin getRandomAlbumsWithPlayCounts", () => {
  it("sums each album's played-track counts in one request", async () => {
    mockJellyfinGet
      .mockResolvedValueOnce({
        data: { Items: [{ Id: "a" }, { Id: "b" }, { Id: "c" }] },
      })
      .mockResolvedValueOnce({
        data: {
          Items: [
            { AlbumId: "a", UserData: { PlayCount: 3 } },
            { AlbumId: "a", UserData: { PlayCount: 2 } },
            { AlbumId: "c", UserData: { PlayCount: 1 } },
            { UserData: { PlayCount: 9 } },
          ],
        },
      });

    const result = await getRandomAlbumsWithPlayCounts({ size: 3 });

    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      IncludeItemTypes: "MusicAlbum",
      SortBy: "Random",
      Limit: 3,
    });
    expect(mockJellyfinGet.mock.calls[1][1].params).toMatchObject({
      IncludeItemTypes: "Audio",
      AlbumIds: "a,b,c",
      Filters: "IsPlayed",
    });
    expect(
      result.albumList2.album?.map(({ id, playCount }) => ({ id, playCount })),
    ).toEqual([
      { id: "a", playCount: 5 },
      { id: "b", playCount: 0 },
      { id: "c", playCount: 1 },
    ]);
  });

  it("skips the track request for an empty pool", async () => {
    mockJellyfinGet.mockResolvedValueOnce({ data: { Items: [] } });

    const result = await getRandomAlbumsWithPlayCounts({ size: 3 });

    expect(mockJellyfinGet).toHaveBeenCalledTimes(1);
    expect(result.albumList2.album).toEqual([]);
  });
});

describe("jellyfin frequent albums", () => {
  const playedTracks = {
    data: {
      Items: [
        {
          Id: "t1",
          AlbumId: "low",
          UserData: { PlayCount: 1, LastPlayedDate: "2026-10-20" },
        },
        {
          Id: "t2",
          AlbumId: "top",
          UserData: { PlayCount: 4, LastPlayedDate: "2026-10-01" },
        },
        {
          Id: "t3",
          AlbumId: "top",
          UserData: { PlayCount: 3, LastPlayedDate: "2026-10-10" },
        },
        {
          Id: "t4",
          AlbumId: "tieOld",
          UserData: { PlayCount: 2, LastPlayedDate: "2026-09-01" },
        },
        {
          Id: "t5",
          AlbumId: "tieNew",
          UserData: { PlayCount: 2, LastPlayedDate: "2026-10-22" },
        },
      ],
    },
  };
  // /Items?Ids= is not guaranteed to answer in the order asked.
  const albumsById = (ids: string) => ({
    data: {
      Items: ids
        .split(",")
        .reverse()
        .map((Id) => ({ Id })),
    },
  });

  it("ranks played albums by summed track plays, then by last play", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    const rsp = await jellyfinGetAlbumList2("frequent", {
      size: 10,
      musicFolderIds: ["lib"],
    });

    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      IncludeItemTypes: "Audio",
      Filters: "IsPlayed",
      ParentId: "lib",
      SortBy: "DatePlayed",
      SortOrder: "Descending",
      Limit: 1000,
    });
    expect(rsp.albumList2.album).toEqual([
      { id: "top", playCount: 7, played: "2026-10-10" },
      { id: "tieNew", playCount: 2, played: "2026-10-22" },
      { id: "tieOld", playCount: 2, played: "2026-09-01" },
      { id: "low", playCount: 1, played: "2026-10-20" },
    ]);
  });

  it("reverses the play order for an ascending browse", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    const rsp = await jellyfinGetAlbumList2("frequent", { order: "asc" });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual([
      "low",
      "tieNew",
      "tieOld",
      "top",
    ]);
  });

  // A counted play refetches this list, so after the first full read only the
  // plays newer than the last one seen are fetched, in a small page.
  it("tops up with the plays since the last read instead of rereading", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );
    await jellyfinGetAlbumList2("frequent", { size: 10 });

    mockJellyfinGet.mockReset();
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(
        params.Ids
          ? albumsById(params.Ids)
          : {
              data: {
                Items: [
                  {
                    Id: "low-track",
                    AlbumId: "low",
                    UserData: { PlayCount: 9, LastPlayedDate: "2026-10-24" },
                  },
                  {
                    Id: "seen",
                    AlbumId: "tieNew",
                    UserData: { PlayCount: 2, LastPlayedDate: "2026-10-22" },
                  },
                ],
              },
            },
      ),
    );
    const rsp = await jellyfinGetAlbumList2("frequent", { size: 10 });

    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      SortBy: "DatePlayed",
      Limit: 10,
      StartIndex: 0,
    });
    expect(
      mockJellyfinGet.mock.calls.filter(
        ([, { params }]) => params.IncludeItemTypes === "Audio",
      ),
    ).toHaveLength(1);
    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual([
      "low",
      "top",
      "tieNew",
      "tieOld",
    ]);
  });

  it("orders recently played albums by their latest track play", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    const rsp = await jellyfinGetAlbumList2("recent", { size: 10 });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual([
      "tieNew",
      "low",
      "top",
      "tieOld",
    ]);
    expect(
      mockJellyfinGet.mock.calls.some(
        ([, { params }]) => params.IncludeItemTypes === "MusicAlbum",
      ),
    ).toBe(false);
  });

  it("reverses the recency order for an ascending browse", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    const rsp = await jellyfinGetAlbumList2("recent", { order: "asc" });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual([
      "tieOld",
      "top",
      "low",
      "tieNew",
    ]);
  });

  it("leaves albums with no play date out of recently played", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(
        params.Ids
          ? albumsById(params.Ids)
          : {
              data: {
                Items: [
                  ...playedTracks.data.Items,
                  { Id: "marked", AlbumId: "marked", UserData: {} },
                ],
              },
            },
      ),
    );

    const recent = await jellyfinGetAlbumList2("recent", { size: 10 });
    const frequent = await jellyfinGetAlbumList2("frequent", { size: 10 });

    expect(recent.albumList2.album?.map((album) => album.id)).not.toContain(
      "marked",
    );
    expect(frequent.albumList2.album?.map((album) => album.id)).toContain(
      "marked",
    );
  });

  // Home refetches both lists after every counted play: one ledger serves both.
  it("shares one history read between most and recently played", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    await Promise.all([
      jellyfinGetAlbumList2("frequent", { size: 10 }),
      jellyfinGetAlbumList2("recent", { size: 10 }),
    ]);

    expect(
      mockJellyfinGet.mock.calls.filter(
        ([, { params }]) => params.IncludeItemTypes === "Audio",
      ),
    ).toHaveLength(1);
  });

  it("ranks once per browse and pages through that ranking", async () => {
    mockJellyfinGet.mockImplementation((_path, { params }) =>
      Promise.resolve(params.Ids ? albumsById(params.Ids) : playedTracks),
    );

    await jellyfinGetAlbumList2("frequent", { size: 2, offset: 0 });
    const second = await jellyfinGetAlbumList2("frequent", {
      size: 2,
      offset: 2,
    });
    const past = await jellyfinGetAlbumList2("frequent", {
      size: 2,
      offset: 4,
    });

    const trackReads = mockJellyfinGet.mock.calls.filter(
      ([, { params }]) => params.IncludeItemTypes === "Audio",
    );
    expect(trackReads).toHaveLength(1);
    expect(second.albumList2.album?.map((album) => album.id)).toEqual([
      "tieOld",
      "low",
    ]);
    expect(past.albumList2.album).toEqual([]);
    expect(mockJellyfinGet).toHaveBeenCalledTimes(3);
  });
});

describe("local getAlbumList2", () => {
  it("passes the direction down to the SQL ORDER BY", async () => {
    mockQueryAlbums.mockResolvedValue([{ album_key: "a" }]);

    const rsp = await localGetAlbumList2("alphabeticalByName", {
      size: 20,
      offset: 40,
      order: "desc",
    });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual(["a"]);
    expect(mockQueryAlbums.mock.calls[0][0]).toMatchObject({
      order: "name",
      direction: "desc",
      limit: 20,
      offset: 40,
    });
  });

  // No direction means the order keeps whichever one it serves by default, so
  // the home carousels make exactly the query they always did.
  it("leaves the direction unset when none is asked for", async () => {
    mockQueryAlbums.mockResolvedValue([]);

    await localGetAlbumList2("newest", { size: 10 });

    expect(mockQueryAlbums.mock.calls[0][0].direction).toBeUndefined();
  });
});

describe("navidrome getAlbumList2", () => {
  beforeEach(() => {
    useAuthBase.setState({ serverType: "navidrome" });
  });

  it("orders the browse through the native API", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [{ id: "a", name: "A" }] });

    const rsp = await navidromeGetAlbumList2("alphabeticalByName", {
      size: 20,
      offset: 40,
      order: "desc",
    });

    expect(rsp.albumList2.album?.map((album) => album.id)).toEqual(["a"]);
    const [path, config] = mockNavidromeGet.mock.calls[0];
    expect(path).toBe("/album");
    expect(config.params).toMatchObject({
      _sort: "name",
      _order: "DESC",
      _start: 40,
      // Exclusive, so this asks for exactly `size` rows.
      _end: 60,
    });
  });

  // "recently added" is `recentlyAdded` on the album repository — the
  // media-file one needs `createdAt` instead, so the two must not be confused.
  it("maps newest onto the album repository's recently_added mapping", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [] });

    await navidromeGetAlbumList2("newest", { order: "asc" });

    expect(mockNavidromeGet.mock.calls[0][1].params).toMatchObject({
      _sort: "recentlyAdded",
      _order: "ASC",
    });
  });

  // Reached through the `subsonic` dispatch slot, which also covers generic
  // OpenSubsonic servers: answer empty there rather than hitting a 404.
  it("returns nothing on a non-Navidrome server", async () => {
    useAuthBase.setState({ serverType: "opensubsonic" });

    const rsp = await navidromeGetAlbumList2("alphabeticalByName", {});

    expect(rsp.albumList2.album).toEqual([]);
    expect(mockNavidromeGet).not.toHaveBeenCalled();
  });
});

// Which implementation a Navidrome browse lands on. `byYear` is the odd one:
// the Subsonic surface can only express a year sort as a year range, so an
// unbounded one goes native in both directions — but a real range is a filter
// only getAlbumList2 honours.
describe("backend getAlbumList2 routing on Navidrome", () => {
  beforeEach(() => {
    useAuthBase.setState({
      serverType: "navidrome",
      hasNavidromeNative: true,
    });
    mockNavidromeGet.mockResolvedValue({ data: [] });
    mockFolderScopedRequest.mockResolvedValue({ albumList2: { album: [] } });
  });

  it("keeps an unordered browse on the Subsonic surface", async () => {
    await backendGetAlbumList2("alphabeticalByName", { size: 20 });

    expect(mockFolderScopedRequest).toHaveBeenCalled();
    expect(mockNavidromeGet).not.toHaveBeenCalled();
  });

  it("sends an unbounded byYear sort native in both directions", async () => {
    await backendGetAlbumList2("byYear", { size: 20 });
    await backendGetAlbumList2("byYear", { size: 20, order: "desc" });

    expect(mockFolderScopedRequest).not.toHaveBeenCalled();
    expect(
      mockNavidromeGet.mock.calls.map((call) => call[1].params._order),
    ).toEqual(["ASC", "DESC"]);
  });

  // The home decade carousels: a real range is a filter, and the native path
  // ignores the bounds entirely.
  it("keeps a year-filtered byYear on getAlbumList2", async () => {
    await backendGetAlbumList2("byYear", {
      size: 20,
      fromYear: 1990,
      toYear: 1999,
    });

    expect(mockNavidromeGet).not.toHaveBeenCalled();
    expect(mockFolderScopedRequest.mock.calls[0][1]).toMatchObject({
      fromYear: 1990,
      toYear: 1999,
    });
  });

  // Without the native session `/api/album` answers 401, which would break the
  // browse itself rather than just its order.
  it("stays on the Subsonic surface with no native session", async () => {
    useAuthBase.setState({ hasNavidromeNative: false });

    await backendGetAlbumList2("byYear", { size: 20 });

    expect(mockNavidromeGet).not.toHaveBeenCalled();
    expect(mockFolderScopedRequest).toHaveBeenCalled();
  });
});
