// Issue #205: an artist's "All songs" used to fetch the whole discography up
// front — one getAlbum per album, 3063 of them for Various Artists on a large
// library. Every backend now answers one page per call, with a cursor for the
// next one.
const mockSubsonicRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockNavidromeGet = jest.fn();
const mockAuth = { serverType: "navidrome", hasNavidromeNative: true };

jest.mock("@/config/storage", () => {
  const make = () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  });
  return {
    storage: { set: () => {}, getString: () => null, remove: () => {} },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("@/services/openSubsonic/index", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  subsonicRequest: (...args: unknown[]) => mockSubsonicRequest(...args),
  folderScopedRequest: jest.fn(),
  isSubsonicDataNotFound: () => false,
  okEnvelope: (payload: object) => ({ status: "ok", ...payload }),
}));

jest.mock("@/services/jellyfin/index", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockJellyfinGet(...args) },
  getDeviceId: () => "device",
  userId: () => "user",
}));

jest.mock("@/services/navidrome", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockNavidromeGet(...args) },
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToChild: (item: { Id: string }) => ({ id: item.Id }),
  mapBaseItemToAlbum: jest.fn(),
  mapBaseItemToArtist: jest.fn(),
  COMMON_FIELDS: "",
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

import { getArtistSongs } from "@/services/backend/browsing";
import { getArtistSongs as jellyfinGetArtistSongs } from "@/services/jellyfin/browsing";
import { getArtistSongs as navidromeGetArtistSongs } from "@/services/navidrome/songs";
import { getArtistSongs as subsonicGetArtistSongs } from "@/services/openSubsonic/browsing";

const ids = (rsp: { artistSongs: { song: { id: string }[] } }) =>
  rsp.artistSongs.song.map((song) => song.id);

// A discography of `count` albums, each with one track named after it.
const stubDiscography = (count: number) => {
  const albums = Array.from({ length: count }, (_, i) => ({ id: `al${i}` }));
  mockSubsonicRequest.mockImplementation(
    async (path: string, params: { id: string }) => {
      if (path === "/rest/getArtist") return { artist: { album: albums } };
      if (params.id === "al3") throw new Error("gone");
      return { album: { song: [{ id: `s-${params.id}` }] } };
    },
  );
};

const getAlbumCalls = () =>
  mockSubsonicRequest.mock.calls.filter(([path]) => path === "/rest/getAlbum");
const getArtistCalls = () =>
  mockSubsonicRequest.mock.calls.filter(([path]) => path === "/rest/getArtist");

beforeEach(() => {
  mockSubsonicRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockNavidromeGet.mockReset();
  mockAuth.serverType = "navidrome";
  mockAuth.hasNavidromeNative = true;
});

describe("navidrome getArtistSongs", () => {
  it("pages the native song list by album artist, in album order", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }] });

    const rsp = await navidromeGetArtistSongs("va", { cursor: 500, size: 500 });

    expect(ids(rsp)).toEqual(["a", "b"]);
    expect(rsp.nextCursor).toBe(502);
    const [path, config] = mockNavidromeGet.mock.calls[0];
    expect(path).toBe("/song");
    expect(config.params).toEqual({
      album_artist_id: "va",
      _sort: "album",
      _order: "ASC",
      _start: 500,
      _end: 1000,
    });
  });

  it("stops on an empty page", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [] });
    const rsp = await navidromeGetArtistSongs("va", { cursor: 1000 });
    expect(rsp.nextCursor).toBeUndefined();
  });
});

describe("subsonic getArtistSongs", () => {
  it("fans out getAlbum over one page of albums at a time", async () => {
    stubDiscography(45);

    const first = await subsonicGetArtistSongs("ar");
    expect(getAlbumCalls()).toHaveLength(20);
    // al3 failed to load: skipped, not fatal.
    expect(ids(first)).toHaveLength(19);
    expect(ids(first)[0]).toBe("s-al0");
    expect(first.nextCursor).toBe(20);

    const second = await subsonicGetArtistSongs("ar", { cursor: 20 });
    expect(ids(second)[0]).toBe("s-al20");
    expect(second.nextCursor).toBe(40);

    const last = await subsonicGetArtistSongs("ar", { cursor: 40 });
    expect(ids(last)).toHaveLength(5);
    expect(last.nextCursor).toBeUndefined();

    // The album list is fetched once for the whole paging run.
    expect(getArtistCalls()).toHaveLength(1);
  });

  it("re-reads the album list when paging starts over", async () => {
    stubDiscography(2);
    await subsonicGetArtistSongs("ar");
    await subsonicGetArtistSongs("ar");
    expect(getArtistCalls()).toHaveLength(2);
  });
});

describe("jellyfin getArtistSongs", () => {
  it("pages /Items with StartIndex / Limit", async () => {
    mockJellyfinGet.mockResolvedValue({
      data: { Items: [{ Id: "a" }, { Id: "b" }], TotalRecordCount: 5 },
    });

    const rsp = await jellyfinGetArtistSongs("ar", { cursor: 2, size: 2 });

    expect(ids(rsp)).toEqual(["a", "b"]);
    expect(rsp.nextCursor).toBe(4);
    expect(mockJellyfinGet.mock.calls[0][1].params).toMatchObject({
      ArtistIds: "ar",
      IncludeItemTypes: "Audio",
      StartIndex: 2,
      Limit: 2,
    });
  });

  it("stops once the total is reached", async () => {
    mockJellyfinGet.mockResolvedValue({
      data: { Items: [{ Id: "e" }], TotalRecordCount: 5 },
    });
    const rsp = await jellyfinGetArtistSongs("ar", { cursor: 4, size: 2 });
    expect(rsp.nextCursor).toBeUndefined();
  });
});

describe("backend getArtistSongs dispatch", () => {
  it("uses the native API with a Navidrome session", async () => {
    mockNavidromeGet.mockResolvedValue({ data: [] });
    await getArtistSongs("ar", { cursor: 0 });
    expect(mockNavidromeGet).toHaveBeenCalled();
    expect(mockSubsonicRequest).not.toHaveBeenCalled();
  });

  it("falls back to the album fan-out without the native session", async () => {
    mockAuth.hasNavidromeNative = false;
    stubDiscography(1);
    await getArtistSongs("ar", { cursor: 0 });
    expect(mockNavidromeGet).not.toHaveBeenCalled();
    expect(getAlbumCalls()).toHaveLength(1);
  });

  it("uses the album fan-out on a plain OpenSubsonic server", async () => {
    mockAuth.serverType = "opensubsonic";
    stubDiscography(1);
    await getArtistSongs("ar", { cursor: 0 });
    expect(mockNavidromeGet).not.toHaveBeenCalled();
  });
});
