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
  mapBaseItemToAlbum: (item: { Id: string }) => ({ id: item.Id }),
  mapBaseItemToChild: jest.fn(),
  mapBaseItemToArtist: jest.fn(),
  COMMON_FIELDS: "",
}));

import { getAlbumList2 as backendGetAlbumList2 } from "@/services/backend/lists";
import { getAlbumList2 as jellyfinGetAlbumList2 } from "@/services/jellyfin/lists";
import { getAlbumList2 as localGetAlbumList2 } from "@/services/local/lists";
import { getAlbumList2 as navidromeGetAlbumList2 } from "@/services/navidrome/albums";
import { getAlbumList2 as subsonicGetAlbumList2 } from "@/services/openSubsonic/lists";
import { useAuthBase } from "@/stores/auth";

beforeEach(() => {
  mockFolderScopedRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockNavidromeGet.mockReset();
  mockQueryAlbums.mockReset();
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

  // Random has no direction to override.
  it("leaves a random browse alone", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetAlbumList2("random", { order: "desc" });

    const params = mockJellyfinGet.mock.calls[0][1].params;
    expect(params.SortBy).toBe("Random");
    expect(params.SortOrder).toBeUndefined();
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
