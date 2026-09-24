// The browse tree used to prefetch the tracklist of every album of every recent
// or starred artist. With Various Artists among them that was ~3000 getAlbum
// calls per rebuild (issue #205). Artist albums are now listed but only fetched
// when the car opens one, and what was opened survives later rebuilds.

const mockGetAlbum = jest.fn();
const mockGetArtist = jest.fn();
const mockGetAlbumList2 = jest.fn();
const mockGetStarred2 = jest.fn();
const mockGetPlaylists = jest.fn();
const mockFetchTopSongs = jest.fn();
let mockScope = "server-a|joel";

jest.mock("@/services/carAuto/artworkMirror", () => ({
  CAR_ARTWORK_SIZE: 600,
  CAR_ARTWORK_BUDGET: 300,
  ensureCarArtwork: async () => undefined,
  cachedCarArtwork: () => undefined,
  retainCarArtwork: () => {},
}));
jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id?: string) => `https://music.example.com/cover/${id}`,
}));
jest.mock("@/services/backend/browsing", () => ({
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
  getArtist: (...args: unknown[]) => mockGetArtist(...args),
}));
jest.mock("@/services/backend/lists", () => ({
  getAlbumList2: (...args: unknown[]) => mockGetAlbumList2(...args),
  getStarred2: (...args: unknown[]) => mockGetStarred2(...args),
}));
jest.mock("@/services/backend/playlists", () => ({
  getPlaylist: jest.fn(),
  getPlaylists: (...args: unknown[]) => mockGetPlaylists(...args),
}));
jest.mock("@/services/topSongs", () => ({
  fetchTopSongs: (...args: unknown[]) => mockFetchTopSongs(...args),
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => mockScope }));
jest.mock("@/stores/podcasts", () => ({
  __esModule: true,
  default: { getState: () => ({}) },
  podcastFavoritesForScope: () => [],
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { getState: () => ({ recentPlays: [] }) },
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

import type { AlbumID3 } from "@/services/openSubsonic/types";

type TreeModule = typeof import("@/services/carAuto/tree");

const albumTile = (id: string) =>
  ({ id, name: id, coverArt: `al-${id}` }) as AlbumID3;

const albumDetail = (id: string) => ({
  album: {
    id,
    name: id,
    coverArt: `al-${id}`,
    song: [
      { id: `${id}-s1`, title: "One" },
      { id: `${id}-s2`, title: "Two" },
    ],
  },
});

const VA_ALBUMS = Array.from({ length: 3000 }, (_, i) => albumTile(`va${i}`));

let tree: TreeModule;

beforeEach(() => {
  jest.isolateModules(() => {
    tree = require("@/services/carAuto/tree");
  });
  mockScope = "server-a|joel";
  mockGetAlbum.mockReset();
  mockGetAlbum.mockImplementation(async (id: string) => albumDetail(id));
  mockGetArtist.mockReset();
  mockGetArtist.mockResolvedValue({
    artist: { id: "va", name: "Various Artists", album: VA_ALBUMS },
  });
  mockGetAlbumList2.mockReset();
  mockGetAlbumList2.mockResolvedValue({ albumList2: { album: [] } });
  mockGetStarred2.mockReset();
  mockGetStarred2.mockResolvedValue({
    starred2: { artist: [{ id: "va", name: "Various Artists" }] },
  });
  mockGetPlaylists.mockReset();
  mockGetPlaylists.mockResolvedValue({ playlists: { playlist: [] } });
  mockFetchTopSongs.mockReset();
  mockFetchTopSongs.mockResolvedValue([]);
});

describe("artist albums", () => {
  it("lists a capped set of album tiles without fetching any tracklist", async () => {
    const { tree: built } = await tree.buildBrowseTree();

    expect(mockGetAlbum).not.toHaveBeenCalled();
    const tiles = built["artist:va"];
    expect(tiles.length).toBe(100);
    expect(tiles.every((n) => n.id.startsWith("album:") && !n.playable)).toBe(
      true,
    );
    expect(built["album:va0"]).toBeUndefined();
  });
});

describe("loadOnDemandChildren", () => {
  it("fetches an opened album once, even when asked concurrently", async () => {
    await tree.buildBrowseTree();

    const [first, second] = await Promise.all([
      tree.loadOnDemandChildren("album:va7"),
      tree.loadOnDemandChildren("album:va7"),
    ]);

    expect(mockGetAlbum).toHaveBeenCalledTimes(1);
    expect(first?.map((n) => n.id)).toEqual([
      "track|album:va7|va7-s1",
      "track|album:va7|va7-s2",
    ]);
    expect(second).toBe(first);
    const snapshot = tree.getSnapshot();
    expect(snapshot.albums.get("va7")?.id).toBe("va7");
    expect(snapshot.tracks.has("va7-s1")).toBe(true);
    expect(snapshot.parentTracks.get("album:va7")).toHaveLength(2);
  });

  it("carries an opened album into later builds without refetching it", async () => {
    await tree.buildBrowseTree();
    await tree.loadOnDemandChildren("album:va7");
    mockGetAlbum.mockClear();

    const { tree: rebuilt } = await tree.buildBrowseTree();

    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(rebuilt["album:va7"]).toHaveLength(2);
    expect(tree.getSnapshot().albums.has("va7")).toBe(true);
  });

  it("drops opened albums when the server or user changes", async () => {
    await tree.buildBrowseTree();
    await tree.loadOnDemandChildren("album:va7");

    mockScope = "server-b|joel";
    const { tree: rebuilt } = await tree.buildBrowseTree();

    expect(rebuilt["album:va7"]).toBeUndefined();
  });

  it("returns null when the fetch fails, so nothing empty is kept", async () => {
    await tree.buildBrowseTree();
    mockGetAlbum.mockRejectedValueOnce(new Error("offline"));

    await expect(tree.loadOnDemandChildren("album:va7")).resolves.toBeNull();
    await expect(tree.loadOnDemandChildren("album:va7")).resolves.toHaveLength(
      2,
    );
  });

  it("only resolves album parents", async () => {
    await tree.buildBrowseTree();

    await expect(tree.loadOnDemandChildren("playlist:p1")).resolves.toBeNull();
    expect(mockGetAlbum).not.toHaveBeenCalled();
  });
});
