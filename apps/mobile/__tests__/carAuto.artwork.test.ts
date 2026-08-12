// Android Auto renders browse items in the host's process, which fetches an
// http(s) icon URI itself — without our headers, our certificate trust, or our
// patience (issue #156). So the tree's covers are mirrored to local files before
// they're pushed, and the native side publishes those as content:// URIs.
// What matters here is the cost of that mirroring: one download per *album*, not
// per track, and a hard budget so a large library can't turn a browse-tree
// rebuild into thousands of requests.

const mockEnsure = jest.fn<Promise<string | undefined>, [string]>();
jest.mock("@/services/carAuto/artworkMirror", () => ({
  CAR_ARTWORK_SIZE: 600,
  CAR_ARTWORK_BUDGET: 3,
  ensureCarArtwork: (url: string) => mockEnsure(url),
}));

jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id?: string, size?: number) =>
    `https://music.example.com/rest/getCoverArt?id=${id}&size=${size}`,
}));

jest.mock("@/services/backend/browsing", () => ({
  getAlbum: jest.fn(),
  getArtist: jest.fn(),
}));
jest.mock("@/services/backend/lists", () => ({
  getAlbumList2: jest.fn(),
  getStarred2: jest.fn(),
}));
jest.mock("@/services/backend/playlists", () => ({
  getPlaylist: jest.fn(),
  getPlaylists: jest.fn(),
}));
jest.mock("@/services/topSongs", () => ({ fetchTopSongs: jest.fn() }));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));
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

import { getSnapshot, localizeTreeArtwork } from "@/services/carAuto/tree";
import type { BrowseNode, BrowseTree } from "@/services/carAuto/types";
import type { AlbumWithSongsID3 } from "@/services/openSubsonic/types";

const remote = (id: string) =>
  `https://music.example.com/rest/getCoverArt?id=${id}&size=600`;

const collection = (id: string, coverArt: string): BrowseNode => ({
  id,
  title: id,
  artworkUrl: remote(coverArt),
  playable: false,
  contentStyle: "list",
});

const track = (id: string, coverArt: string): BrowseNode => ({
  id,
  title: id,
  artworkUrl: remote(coverArt),
  playable: true,
});

beforeEach(() => {
  mockEnsure.mockReset();
  mockEnsure.mockImplementation(async (url) => {
    const id = url.match(/id=([^&]+)/)?.[1];
    return `file:///cache/car-artwork/${id}`;
  });
  const snapshot = getSnapshot();
  snapshot.albums.clear();
});

// Registers an album so `album:<id>` parents can resolve their own cover.
const registerAlbum = (id: string, coverArt: string) => {
  getSnapshot().albums.set(id, {
    id,
    coverArt,
  } as AlbumWithSongsID3);
};

describe("localizeTreeArtwork", () => {
  it("mirrors an album's cover once and hands it to every track under it", async () => {
    registerAlbum("a1", "al-1");
    const tree: BrowseTree = {
      "lib:albums": [collection("album:a1", "al-1")],
      // Track covers are per-track ids on Navidrome (mf-…) that resolve to the
      // same image as the album's al-… cover.
      "album:a1": [
        track("track|album:a1|t1", "mf-1"),
        track("track|album:a1|t2", "mf-2"),
        track("track|album:a1|t3", "mf-3"),
      ],
    };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(true);
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(mockEnsure).toHaveBeenCalledWith(remote("al-1"));
    const local = "file:///cache/car-artwork/al-1";
    expect(tree["lib:albums"][0].artworkUrl).toBe(local);
    for (const node of tree["album:a1"]) {
      expect(node.artworkUrl).toBe(local);
    }
  });

  it("mirrors each cover once when the same one appears in several places", async () => {
    const tree: BrowseTree = {
      "home:section:recent": [collection("album:a1", "al-1")],
      "home:section:newest": [collection("album:a1", "al-1")],
      "lib:albums": [collection("album:a1", "al-1")],
    };

    await localizeTreeArtwork(tree);

    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it("spends the budget on collections before track rows", async () => {
    // Budget is 3 (mocked). Four collections and a playlist's tracks compete.
    const tree: BrowseTree = {
      "lib:albums": [
        collection("album:a1", "al-1"),
        collection("album:a2", "al-2"),
        collection("album:a3", "al-3"),
        collection("album:a4", "al-4"),
      ],
      // Not under an album parent, so these can't inherit and must queue their
      // own covers — behind the collections.
      "playlist:p1": [track("track|playlist:p1|t1", "mf-9")],
    };

    await localizeTreeArtwork(tree);

    const requested = mockEnsure.mock.calls.map(([url]) => url);
    expect(requested).toEqual([remote("al-1"), remote("al-2"), remote("al-3")]);
    // Past the budget the remote URL stays — degraded, never worse than before.
    expect(tree["lib:albums"][3].artworkUrl).toBe(remote("al-4"));
    expect(tree["playlist:p1"][0].artworkUrl).toBe(remote("mf-9"));
  });

  it("keeps the remote URL when a cover can't be mirrored", async () => {
    mockEnsure.mockResolvedValue(undefined);
    const tree: BrowseTree = {
      "lib:albums": [collection("album:a1", "al-1")],
    };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(false);
    expect(tree["lib:albums"][0].artworkUrl).toBe(remote("al-1"));
  });

  it("survives a mirror that throws", async () => {
    mockEnsure.mockRejectedValue(new Error("network down"));
    const tree: BrowseTree = {
      "lib:albums": [collection("album:a1", "al-1")],
    };

    await expect(localizeTreeArtwork(tree)).resolves.toBe(false);
    expect(tree["lib:albums"][0].artworkUrl).toBe(remote("al-1"));
  });

  it("leaves local and missing artwork alone", async () => {
    const tree: BrowseTree = {
      "tab:home": [
        { id: "home:section:recent", title: "recent", playable: false },
        {
          id: "album:local",
          title: "local",
          artworkUrl: "file:///doc/local-artwork/cover.jpg",
          playable: false,
        },
      ],
    };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(false);
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(tree["tab:home"][1].artworkUrl).toBe(
      "file:///doc/local-artwork/cover.jpg",
    );
  });
});
