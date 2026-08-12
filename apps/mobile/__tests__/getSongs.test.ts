// No backend exposes a "get all songs" endpoint, so each one fakes it
// differently: Subsonic pages an empty-query search3, Jellyfin sorts /Items by
// name, and the local library reads its index (or its FTS table when there is a
// query). All three have to come back as the same `{ songs: { song } }`
// envelope the All tracks browse consumes.
const mockFolderScopedRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockNavidromeGet = jest.fn();
const mockQuerySongs = jest.fn();
const mockSearchTracks = jest.fn();

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
  querySongs: (...args: unknown[]) => mockQuerySongs(...args),
  searchTracks: (...args: unknown[]) => mockSearchTracks(...args),
  queryAlbums: jest.fn(),
  queryAlbumByKey: jest.fn(),
  queryArtistByKey: jest.fn(),
  queryTopSongs: jest.fn(),
  queryTrackById: jest.fn(),
}));

jest.mock("@/services/local/mappers", () => ({
  mapRowToChild: (row: { id: string }) => ({ id: row.id, title: row.id }),
  mapAggToAlbum: jest.fn(),
  mapAggToArtist: jest.fn(),
}));

// The local backend reaches i18n for its "unknown album" labels, and its zod
// locale imports are ESM-only.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToChild: (item: { Id: string }) => ({
    id: item.Id,
    title: item.Id,
  }),
  mapBaseItemToAlbum: jest.fn(),
  mapBaseItemToArtist: jest.fn(),
  COMMON_FIELDS: "",
}));

import { getSongs as jellyfinGetSongs } from "@/services/jellyfin/lists";
import { getSongs as localGetSongs } from "@/services/local/lists";
import { getSongs as navidromeGetSongs } from "@/services/navidrome/songs";
import { getSongs as subsonicGetSongs } from "@/services/openSubsonic/lists";

beforeEach(() => {
  mockFolderScopedRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockNavidromeGet.mockReset();
  mockQuerySongs.mockReset();
  mockSearchTracks.mockReset();
});

describe("subsonic getSongs", () => {
  it("pages an empty-query search3 with albums and artists switched off", async () => {
    mockFolderScopedRequest.mockResolvedValue({
      searchResult3: { song: [{ id: "a" }, { id: "b" }] },
    });

    const rsp = await subsonicGetSongs({ size: 50, offset: 100 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a", "b"]);
    const [path, params] = mockFolderScopedRequest.mock.calls[0];
    expect(path).toBe("/rest/search3");
    expect(params).toMatchObject({
      query: "",
      songCount: 50,
      songOffset: 100,
      albumCount: 0,
      artistCount: 0,
    });
  });

  it("passes a search query through the same call", async () => {
    mockFolderScopedRequest.mockResolvedValue({ searchResult3: {} });

    const rsp = await subsonicGetSongs({ query: "radio" });

    expect(rsp.songs.song).toEqual([]);
    expect(mockFolderScopedRequest.mock.calls[0][1]).toMatchObject({
      query: "radio",
    });
  });

  // search3 has no sort parameter, so a sort can only be silently dropped here
  // — which is why utils/songSort hides the control for plain OpenSubsonic.
  it("sends no sort parameter, whatever it is handed", async () => {
    mockFolderScopedRequest.mockResolvedValue({ searchResult3: {} });

    await subsonicGetSongs({ size: 50, sort: "albumDesc" });

    expect(
      Object.keys(mockFolderScopedRequest.mock.calls[0][1] as object),
    ).not.toContain("sort");
  });
});

describe("navidrome getSongs", () => {
  it("orders the whole library through the native API", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [{ id: "a" }] });

    const rsp = await navidromeGetSongs({
      size: 50,
      offset: 100,
      sort: "playCountDesc",
    });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    const [path, config] = mockNavidromeGet.mock.calls[0];
    expect(path).toBe("/song");
    expect(config.params).toMatchObject({
      _sort: "playCount",
      _order: "DESC",
      _start: 100,
      // Exclusive, so this asks for exactly `size` rows.
      _end: 150,
    });
  });

  // "recently added" is `createdAt` on media_file; `recently_added` is a
  // mapping only the album repository has.
  it("maps addedAt onto the media-file created_at column", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [] });

    await navidromeGetSongs({ sort: "addedAtAsc" });

    expect(mockNavidromeGet.mock.calls[0][1].params).toMatchObject({
      _sort: "createdAt",
      _order: "ASC",
    });
  });
});

describe("jellyfin getSongs", () => {
  it("browses audio items in name order, without a search term", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [{ Id: "a" }] } });

    const rsp = await jellyfinGetSongs({ size: 50, offset: 100 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockJellyfinGet).toHaveBeenCalledTimes(1);
    const params = mockJellyfinGet.mock.calls[0][1].params;
    expect(params).toMatchObject({
      IncludeItemTypes: "Audio",
      Recursive: true,
      SortBy: "SortName",
      Limit: 50,
      StartIndex: 100,
    });
    expect(params.SearchTerm).toBeUndefined();
  });

  it("overrides the default order with the chosen sort", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetSongs({ size: 50, sort: "yearDesc" });

    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      SortBy: "ProductionYear,SortName",
      SortOrder: "Descending",
    });
  });

  it("sends a search term when there is a query", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });

    await jellyfinGetSongs({ query: "radio" });

    const audioCall = mockJellyfinGet.mock.calls.find(
      (call) => call[1].params.IncludeItemTypes === "Audio",
    );
    expect(audioCall?.[1].params).toMatchObject({ SearchTerm: "radio" });
  });

  // SearchTerm only matches item names, so an artist/album query would
  // otherwise come back empty where the Subsonic backend returns their tracks.
  // Verified against Jellyfin 10.11.11: searching "Bicep" matches 0 track names
  // and only the self-titled album, so without the artist branch the screen
  // showed that one album instead of all 5.
  it("unions in the tracks of artists and albums whose name matches", async () => {
    mockJellyfinGet.mockImplementation((path: string, config) => {
      const { IncludeItemTypes, SearchTerm, ArtistIds, AlbumIds } =
        config.params;
      // Artists aren't returned by /Items — only /Artists lists them.
      if (path === "/Artists") {
        return Promise.resolve({ data: { Items: [{ Id: "artist-1" }] } });
      }
      if (IncludeItemTypes === "MusicAlbum") {
        return Promise.resolve({ data: { Items: [{ Id: "album-1" }] } });
      }
      if (ArtistIds === "artist-1") {
        return Promise.resolve({ data: { Items: [{ Id: "b", Name: "b" }] } });
      }
      if (AlbumIds === "album-1") {
        return Promise.resolve({ data: { Items: [{ Id: "c", Name: "c" }] } });
      }
      return Promise.resolve({
        data: { Items: SearchTerm ? [{ Id: "a", Name: "a" }] : [] },
      });
    });

    const rsp = await jellyfinGetSongs({ query: "radio", size: 50 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a", "b", "c"]);
  });

  // A music folder scopes tracks and albums, but artists live outside that
  // hierarchy — an /Items lookup for them returns nothing either way.
  it("looks artists up through /Artists, not /Items", async () => {
    mockJellyfinGet.mockImplementation((path: string, config) => {
      if (path === "/Artists") {
        return Promise.resolve({ data: { Items: [{ Id: "artist-1" }] } });
      }
      if (config.params.ArtistIds === "artist-1") {
        return Promise.resolve({ data: { Items: [{ Id: "a", Name: "a" }] } });
      }
      return Promise.resolve({ data: { Items: [] } });
    });

    const rsp = await jellyfinGetSongs({
      query: "bicep",
      size: 50,
      musicFolderId: "folder-1",
    });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockJellyfinGet.mock.calls).toContainEqual([
      "/Artists",
      expect.objectContaining({
        params: expect.objectContaining({ SearchTerm: "bicep" }),
      }),
    ]);
    expect(
      mockJellyfinGet.mock.calls.some(
        (call) => call[1].params.IncludeItemTypes === "MusicArtist",
      ),
    ).toBe(false);
  });

  // Every page merges the same fixed window and slices it. A per-page window
  // (offset + size) can't work: each branch's prefix grows at the front as the
  // limit rises, so pages overlap — on the test server that returned 8 unique
  // tracks out of 11 across four pages.
  it("pages the merged search from one page-independent window", async () => {
    mockJellyfinGet.mockImplementation((path: string, config) => {
      const { IncludeItemTypes, ArtistIds } = config.params;
      if (path === "/Artists") {
        return Promise.resolve({ data: { Items: [{ Id: "artist-1" }] } });
      }
      if (IncludeItemTypes === "MusicAlbum") {
        return Promise.resolve({ data: { Items: [] } });
      }
      if (ArtistIds === "artist-1") {
        return Promise.resolve({ data: { Items: [{ Id: "b", Name: "b" }] } });
      }
      return Promise.resolve({ data: { Items: [{ Id: "a", Name: "a" }] } });
    });

    const page1 = await jellyfinGetSongs({
      query: "radio",
      size: 1,
      offset: 0,
    });
    const page2 = await jellyfinGetSongs({
      query: "radio",
      size: 1,
      offset: 1,
    });
    const page3 = await jellyfinGetSongs({
      query: "radio",
      size: 1,
      offset: 2,
    });

    expect(page1.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(page2.songs.song?.map((song) => song.id)).toEqual(["b"]);
    // An empty page is what stops useInfiniteSongs.
    expect(page3.songs.song).toEqual([]);
    const audioLimits = mockJellyfinGet.mock.calls
      .filter((call) => call[1].params.IncludeItemTypes === "Audio")
      .map((call) => call[1].params.Limit);
    expect(new Set(audioLimits).size).toBe(1);
  });
});

describe("local getSongs", () => {
  it("reads the index when there is no query", async () => {
    mockQuerySongs.mockResolvedValue([{ id: "a" }]);

    const rsp = await localGetSongs({ size: 50, offset: 100 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockQuerySongs).toHaveBeenCalledWith({
      limit: 50,
      offset: 100,
      // No order: the repository keeps its title default.
      order: undefined,
      direction: "asc",
    });
    expect(mockSearchTracks).not.toHaveBeenCalled();
  });

  it("passes the chosen order and direction to the query", async () => {
    mockQuerySongs.mockResolvedValue([]);

    await localGetSongs({ size: 50, sort: "durationDesc" });

    expect(mockQuerySongs).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      order: "duration",
      direction: "desc",
    });
  });

  it("goes through the FTS index when there is one", async () => {
    mockSearchTracks.mockResolvedValue([{ id: "b" }]);

    const rsp = await localGetSongs({ query: "radio", size: 50, offset: 100 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["b"]);
    expect(mockSearchTracks).toHaveBeenCalledWith("radio", 50, 100);
    expect(mockQuerySongs).not.toHaveBeenCalled();
  });

  // FTS rows come back in relevance order, which is the point of searching.
  it("ignores the sort while searching", async () => {
    mockSearchTracks.mockResolvedValue([]);

    await localGetSongs({ query: "radio", size: 50, sort: "albumAsc" });

    expect(mockSearchTracks).toHaveBeenCalledWith("radio", 50, 0);
    expect(mockQuerySongs).not.toHaveBeenCalled();
  });
});
