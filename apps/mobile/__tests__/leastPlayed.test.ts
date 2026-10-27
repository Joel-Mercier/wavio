const mockGetAlbumList2 = jest.fn();

jest.mock("@/services/backend/dispatch", () => ({
  dispatch: (subsonic: unknown) => subsonic,
  isNavidrome: () => false,
  isNavidromeNative: () => false,
}));

jest.mock("@/services/openSubsonic/lists", () => ({
  getAlbumList2: (...args: unknown[]) => mockGetAlbumList2(...args),
}));

jest.mock("@/services/jellyfin/lists", () => ({}));
jest.mock("@/services/local/lists", () => ({}));
jest.mock("@/services/navidrome/albums", () => ({}));
jest.mock("@/services/navidrome/songs", () => ({}));

import { getLeastPlayedAlbums } from "@/services/backend/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { leastPlayed } from "@/utils/leastPlayed";

const album = (id: string, playCount?: number) =>
  ({ id, playCount }) as AlbumID3;

beforeEach(() => {
  mockGetAlbumList2.mockReset();
});

describe("leastPlayed", () => {
  it("puts the least played first and keeps the pool order within a tie", () => {
    const pool = [
      album("a", 3),
      album("b", 0),
      album("c"),
      album("d", 1),
      album("e", 0),
    ];
    expect(leastPlayed(pool, 5).map((a) => a.id)).toEqual([
      "b",
      "c",
      "e",
      "d",
      "a",
    ]);
  });

  it("returns at most `size` albums without mutating the pool", () => {
    const pool = [album("a", 2), album("b", 1), album("c", 0)];
    expect(leastPlayed(pool, 2).map((a) => a.id)).toEqual(["c", "b"]);
    expect(pool.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});

describe("getLeastPlayedAlbums", () => {
  it("draws a random pool and keeps its least played slice", async () => {
    mockGetAlbumList2.mockResolvedValue({
      albumList2: {
        album: [album("a", 5), album("b", 0), album("c", 2), album("d")],
      },
    });

    const result = await getLeastPlayedAlbums({
      size: 2,
      musicFolderIds: ["lib-1"],
    });

    expect(mockGetAlbumList2).toHaveBeenCalledWith("random", {
      size: 8,
      offset: 0,
      musicFolderIds: ["lib-1"],
    });
    expect(result.albumList2.album.map((a) => a.id)).toEqual(["b", "d"]);
    expect(result.poolCount).toBe(4);
  });

  it("reads page n from pool n", async () => {
    mockGetAlbumList2.mockResolvedValue({ albumList2: { album: [] } });

    await getLeastPlayedAlbums({ size: 12, offset: 24 });

    expect(mockGetAlbumList2).toHaveBeenCalledWith("random", {
      size: 48,
      offset: 96,
      musicFolderIds: undefined,
    });
  });

  it("caps the pool at the Subsonic list limit", async () => {
    mockGetAlbumList2.mockResolvedValue({ albumList2: { album: [] } });

    await getLeastPlayedAlbums({ size: 200, offset: 200 });

    expect(mockGetAlbumList2).toHaveBeenCalledWith("random", {
      size: 500,
      offset: 500,
      musicFolderIds: undefined,
    });
  });

  it("reports an empty pool so pagination can stop", async () => {
    mockGetAlbumList2.mockResolvedValue({ albumList2: {} });

    const result = await getLeastPlayedAlbums({ size: 12 });

    expect(result.albumList2.album).toEqual([]);
    expect(result.poolCount).toBe(0);
  });
});
