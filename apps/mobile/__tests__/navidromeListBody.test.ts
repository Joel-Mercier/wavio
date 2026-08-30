// Navidrome's native REST API returns a bare JSON array from every list
// endpoint, so callers map/filter the body directly. A reverse proxy — or
// Navidrome itself erroring — can answer HTTP 200 with an HTML page or a
// `{error}` object instead, and `?? []` waves that through to `.filter` as
// `TypeError: undefined is not a function` from deep inside a mapper
// (Sentry WAVIO-GM, 16 users).
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

// getGenres reaches openSubsonic/index for okEnvelope, which pulls in the zod
// locale bundles jest can't transform.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/navidrome/auth", () => ({
  reauthenticateNavidrome: jest.fn(),
  nativeLogin: jest.fn(),
}));

import { QueryClient } from "@tanstack/react-query";
import { forgetPlaylistQueries } from "@/hooks/backend/forgetPlaylistQueries";
import navidromeApiInstance from "@/services/navidrome";
import { getAlbumList2 } from "@/services/navidrome/albums";
import { getGenres } from "@/services/navidrome/genres";
import { asList } from "@/services/navidrome/listBody";
import { getPlaylistsByOwner } from "@/services/navidrome/playlists";
import { getMostPlayedSongs, getSongs } from "@/services/navidrome/songs";
import { getUsers } from "@/services/navidrome/users";
import { useAuthBase } from "@/stores/auth";

const mockGet = jest.spyOn(navidromeApiInstance, "get");

// The shapes actually observed on a 200: a proxy's HTML error page, and a JSON
// error object. Neither is an array; both are truthy, so `?? []` passes them on.
const NON_ARRAY_BODIES = [
  "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>",
  { error: "internal" },
  null,
  undefined,
];

beforeEach(() => {
  mockGet.mockReset();
  // The song/album readers early-return an empty list on any other server type,
  // so they'd never reach the request under test.
  useAuthBase.setState({ serverType: "navidrome" });
});

describe("asList", () => {
  it.each(NON_ARRAY_BODIES)("resolves %p to an empty list", (body) => {
    expect(asList(body)).toEqual([]);
  });

  it("passes an array through untouched", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(asList(rows)).toBe(rows);
  });
});

describe("navidrome list endpoints given a non-array body", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["getMostPlayedSongs", () => getMostPlayedSongs({ size: 12, offset: 0 })],
    ["getSongs", () => getSongs({ size: 12, offset: 0 })],
    ["getAlbumList2", () => getAlbumList2("newest", { size: 12, offset: 0 })],
    ["getGenres", () => getGenres({})],
    ["getPlaylistsByOwner", () => getPlaylistsByOwner("owner-1")],
    ["getUsers", () => getUsers()],
  ];

  it.each(cases)("%s resolves instead of throwing", async (_name, call) => {
    mockGet.mockResolvedValue({ data: NON_ARRAY_BODIES[0] } as never);
    await expect(call()).resolves.toBeDefined();
  });

  it("getMostPlayedSongs still filters a real array on playCount", async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: "1", title: "played", playCount: 3 },
        { id: "2", title: "never", playCount: 0 },
      ],
    } as never);
    const rsp = await getMostPlayedSongs({ size: 12, offset: 0 });
    expect(rsp.songs.song ?? []).toHaveLength(1);
    expect(rsp.songs.song?.[0].id).toBe("1");
  });
});

// Deleting a playlist leaves its detail queries in the cache while the screen
// navigates away; a refetch then hits Navidrome's native /api/playlist/{id},
// which answers a gone playlist with a 500 rather than a 404 (Sentry WAVIO-H3).
describe("forgetPlaylistQueries", () => {
  let client: QueryClient;

  const seed = (id: string) => {
    client.setQueryData(["playlist", id], { playlist: { id } });
    client.setQueryData(["nd", "playlist", id], { id });
  };

  beforeEach(() => {
    client = new QueryClient();
  });

  // Each seeded query arms a gc timer; without this jest never exits.
  afterEach(() => {
    client.clear();
  });

  it("removes both detail views of the deleted playlist", () => {
    seed("gone");
    forgetPlaylistQueries(client, "gone");

    expect(client.getQueryData(["playlist", "gone"])).toBeUndefined();
    expect(client.getQueryData(["nd", "playlist", "gone"])).toBeUndefined();
  });

  it("leaves other playlists and the list query alone", () => {
    seed("gone");
    seed("kept");
    client.setQueryData(["playlists"], [{ id: "kept" }]);

    forgetPlaylistQueries(client, "gone");

    expect(client.getQueryData(["playlist", "kept"])).toEqual({
      playlist: { id: "kept" },
    });
    expect(client.getQueryData(["nd", "playlist", "kept"])).toEqual({
      id: "kept",
    });
    expect(client.getQueryData(["playlists"])).toEqual([{ id: "kept" }]);
  });

  // invalidateQueries would mark them stale and refetch — the exact request
  // this exists to prevent. Removal must leave nothing behind to refetch.
  it("leaves no query in the cache to refetch", () => {
    seed("gone");
    forgetPlaylistQueries(client, "gone");

    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys).not.toContain(JSON.stringify(["playlist", "gone"]));
    expect(keys).not.toContain(JSON.stringify(["nd", "playlist", "gone"]));
  });
});
