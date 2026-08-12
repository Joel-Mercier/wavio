// Artists live outside Jellyfin's library item hierarchy, so /Items never
// returns them whatever the filters — verified against 10.11.11, where every
// `IncludeItemTypes=MusicArtist` query comes back empty while /Artists lists
// them. Every artist lookup therefore has to go through /Artists; the mock
// below reproduces that server behaviour so a regression fails here.
const mockJellyfinGet = jest.fn();

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

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockJellyfinGet(...args) },
  getDeviceId: () => "device",
  userId: () => "user",
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToChild: (item: { Id: string; Name?: string }) => ({
    id: item.Id,
    title: item.Name ?? item.Id,
  }),
  mapBaseItemToAlbum: (item: { Id: string; Name?: string }) => ({
    id: item.Id,
    name: item.Name ?? item.Id,
  }),
  mapBaseItemToArtist: (item: { Id: string; Name?: string }) => ({
    id: item.Id,
    name: item.Name ?? item.Id,
  }),
  COMMON_FIELDS: "",
}));

import { getStarred2 } from "@/services/jellyfin/lists";
import { search3 } from "@/services/jellyfin/searching";

// The server: /Items answers for albums and audio, /Artists for artists, and
// an IncludeItemTypes=MusicArtist query answers with nothing at all.
function serveJellyfin(
  artists: {
    Id: string;
    Name: string;
    UserData?: { IsFavorite: boolean };
  }[],
) {
  mockJellyfinGet.mockImplementation((path: string, config) => {
    if (path === "/Artists") {
      return Promise.resolve({ data: { Items: artists } });
    }
    if (config.params.IncludeItemTypes === "MusicArtist") {
      return Promise.resolve({ data: { Items: [] } });
    }
    return Promise.resolve({ data: { Items: [{ Id: "album-1" }] } });
  });
}

beforeEach(() => {
  mockJellyfinGet.mockReset();
});

describe("jellyfin search3", () => {
  it("finds artists through /Artists", async () => {
    serveJellyfin([{ Id: "artist-1", Name: "Bicep" }]);

    const rsp = await search3("bicep", { artistCount: 20, artistOffset: 0 });

    expect(rsp.searchResult3?.artist?.map((a) => a.id)).toEqual(["artist-1"]);
    expect(mockJellyfinGet.mock.calls).toContainEqual([
      "/Artists",
      expect.objectContaining({
        params: expect.objectContaining({
          SearchTerm: "bicep",
          Limit: 20,
          StartIndex: 0,
        }),
      }),
    ]);
  });

  it("does not ask /Items for artists", async () => {
    serveJellyfin([{ Id: "artist-1", Name: "Bicep" }]);

    await search3("bicep", {});

    expect(
      mockJellyfinGet.mock.calls.some(
        (call) => call[1].params.IncludeItemTypes === "MusicArtist",
      ),
    ).toBe(false);
  });
});

describe("jellyfin getStarred2", () => {
  // On /Artists both IsFavorite=true and Filters=IsFavorite match artists that
  // merely *have* a favourite album or song, so the flag has to be read off
  // each artist instead — otherwise starring one Bicep album puts Bicep in
  // Favorites and in the Library list.
  it("keeps only artists whose own UserData says favourite", async () => {
    serveJellyfin([
      { Id: "artist-1", Name: "Bicep", UserData: { IsFavorite: false } },
      { Id: "artist-2", Name: "Metallica", UserData: { IsFavorite: true } },
      { Id: "artist-3", Name: "Hamdi" },
    ]);

    const rsp = await getStarred2({});

    expect(rsp.starred2?.artist?.map((a) => a.id)).toEqual(["artist-2"]);
    // Albums and songs keep the /Items + Filters form, which does work.
    expect(
      mockJellyfinGet.mock.calls.filter(
        (call) => call[1].params.Filters === "IsFavorite",
      ),
    ).toHaveLength(2);
    expect(
      mockJellyfinGet.mock.calls.some(
        (call) =>
          call[0] === "/Artists" &&
          (call[1].params.IsFavorite !== undefined ||
            call[1].params.Filters !== undefined),
      ),
    ).toBe(false);
  });
});
