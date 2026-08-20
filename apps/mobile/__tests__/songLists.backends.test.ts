// Subsonic answers these song lists under an endpoint-specific envelope key
// (`randomSongs`, `songsByGenre`, a top-level `sonicMatch`), while Jellyfin and
// the local library answer the `{ songs: { song } }` shape the app reads. The
// request generics are casts with no runtime check, so a wrong key compiles and
// then silently yields undefined — that was #169, where shuffle-play on the All
// tracks screen drew an empty window and did nothing at all. These lock the
// rename in place on every backend.
const mockFolderScopedRequest = jest.fn();
const mockSubsonicRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockQuerySongs = jest.fn();

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
  subsonicRequest: (...args: unknown[]) => mockSubsonicRequest(...args),
  folderScopedRequest: (...args: unknown[]) => mockFolderScopedRequest(...args),
  okEnvelope: (payload: object) => ({ status: "ok", ...payload }),
  isSubsonicDataNotFound: () => false,
}));

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockJellyfinGet(...args) },
  getDeviceId: () => "device",
  userId: () => "user",
}));

jest.mock("@/services/local/repository", () => ({
  querySongs: (...args: unknown[]) => mockQuerySongs(...args),
  searchTracks: jest.fn(),
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

import {
  getRandomSongs as jellyfinGetRandomSongs,
  getSongsByGenre as jellyfinGetSongsByGenre,
} from "@/services/jellyfin/lists";
import {
  getRandomSongs as localGetRandomSongs,
  getSongsByGenre as localGetSongsByGenre,
} from "@/services/local/lists";
import { getSonicSimilarTracks as subsonicGetSonicSimilarTracks } from "@/services/openSubsonic/browsing";
import {
  getRandomSongs as subsonicGetRandomSongs,
  getSongsByGenre as subsonicGetSongsByGenre,
} from "@/services/openSubsonic/lists";

beforeEach(() => {
  mockFolderScopedRequest.mockReset();
  mockSubsonicRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockQuerySongs.mockReset();
});

describe("subsonic getRandomSongs", () => {
  it("renames the randomSongs envelope onto the songs contract", async () => {
    mockFolderScopedRequest.mockResolvedValue({
      randomSongs: { song: [{ id: "a" }, { id: "b" }] },
    });

    const rsp = await subsonicGetRandomSongs({ size: 500 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a", "b"]);
    const [path, params] = mockFolderScopedRequest.mock.calls[0];
    expect(path).toBe("/rest/getRandomSongs");
    expect(params).toMatchObject({ size: 500 });
  });

  // The empty payload is what a code-70 (empty or stale music folder) resolves
  // to, so it has to be spelled in wire keys and survive the same rename.
  it("hands folderScopedRequest a wire-shaped empty payload", async () => {
    mockFolderScopedRequest.mockResolvedValue({ randomSongs: {} });

    const rsp = await subsonicGetRandomSongs({ size: 500 });

    expect(mockFolderScopedRequest.mock.calls[0][2]).toEqual({
      randomSongs: {},
    });
    expect(rsp.songs).toEqual({});
    expect(rsp.songs.song).toBeUndefined();
  });

  // A server that answers nothing at all must still produce the contract shape
  // rather than an undefined `songs` the callers would crash on.
  it("survives an envelope with no randomSongs at all", async () => {
    mockFolderScopedRequest.mockResolvedValue({});

    const rsp = await subsonicGetRandomSongs({ size: 500 });

    expect(rsp.songs).toEqual({});
  });
});

describe("subsonic getSongsByGenre", () => {
  it("renames the songsByGenre envelope onto the songs contract", async () => {
    mockFolderScopedRequest.mockResolvedValue({
      songsByGenre: { song: [{ id: "a" }] },
    });

    const rsp = await subsonicGetSongsByGenre("rock", { count: 12 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    const [path, params, empty] = mockFolderScopedRequest.mock.calls[0];
    expect(path).toBe("/rest/getSongsByGenre");
    expect(params).toMatchObject({ genre: "rock", count: 12 });
    expect(empty).toEqual({ songsByGenre: {} });
  });
});

describe("subsonic getSonicSimilarTracks", () => {
  // The matches are top-level on the envelope; the wrapper the name implies
  // does not exist on the wire.
  it("lifts a top-level sonicMatch into the sonicSimilarTracks wrapper", async () => {
    mockSubsonicRequest.mockResolvedValue({
      sonicMatch: [{ entry: { id: "a" }, similarity: 0.9 }],
    });

    const rsp = await subsonicGetSonicSimilarTracks("song-1", { count: 20 });

    expect(
      rsp.sonicSimilarTracks.sonicMatch?.map((match) => match.entry.id),
    ).toEqual(["a"]);
    const [path, params] = mockSubsonicRequest.mock.calls[0];
    expect(path).toBe("/rest/getSonicSimilarTracks");
    expect(params).toMatchObject({ id: "song-1", count: 20 });
  });

  it("yields an empty match list when the server sends none", async () => {
    mockSubsonicRequest.mockResolvedValue({});

    const rsp = await subsonicGetSonicSimilarTracks("song-1", {});

    expect(rsp.sonicSimilarTracks.sonicMatch).toEqual([]);
  });
});

describe("jellyfin song lists", () => {
  it("returns getRandomSongs under the same songs key", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [{ Id: "a" }] } });

    const rsp = await jellyfinGetRandomSongs({ size: 12 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      IncludeItemTypes: "Audio",
      SortBy: "Random",
      Limit: 12,
    });
  });

  it("returns getSongsByGenre under the same songs key", async () => {
    mockJellyfinGet.mockResolvedValue({ data: { Items: [{ Id: "a" }] } });

    const rsp = await jellyfinGetSongsByGenre("rock", { count: 12 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      Genres: "rock",
      Limit: 12,
    });
  });
});

describe("local song lists", () => {
  it("returns getRandomSongs under the same songs key", async () => {
    mockQuerySongs.mockResolvedValue([{ id: "a" }]);

    const rsp = await localGetRandomSongs({ size: 12 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockQuerySongs.mock.calls[0][0]).toMatchObject({
      random: true,
      limit: 12,
    });
  });

  it("returns getSongsByGenre under the same songs key", async () => {
    mockQuerySongs.mockResolvedValue([{ id: "a" }]);

    const rsp = await localGetSongsByGenre("rock", { count: 12 });

    expect(rsp.songs.song?.map((song) => song.id)).toEqual(["a"]);
    expect(mockQuerySongs.mock.calls[0][0]).toMatchObject({
      genre: "rock",
      limit: 12,
    });
  });
});
