// Android Auto renders browse items in the host's process, which fetches an
// http(s) icon URI itself — without our headers, our certificate trust, or our
// patience (issue #156). So the tree's covers are mirrored to local files before
// they're pushed, and the native side publishes those as content:// URIs.
// What matters here is the cost of that mirroring: one download per *album*, not
// per track, and a hard budget so a large library can't turn a browse-tree
// rebuild into thousands of requests.

const mockEnsure = jest.fn<Promise<string | undefined>, [string]>();
const mockCached = jest.fn<string | undefined, [string | undefined]>();
jest.mock("@/services/carAuto/artworkMirror", () => ({
  CAR_ARTWORK_SIZE: 600,
  CAR_ARTWORK_BUDGET: 3,
  ensureCarArtwork: (url: string) => mockEnsure(url),
  cachedCarArtwork: (url?: string) => mockCached(url),
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
  mockCached.mockReset();
  // Cold mirror by default: nothing has been downloaded yet.
  mockCached.mockReturnValue(undefined);
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
    expect(tree["lib:albums"][0].localArtworkUrl).toBe(local);
    for (const node of tree["album:a1"]) {
      expect(node.localArtworkUrl).toBe(local);
    }
  });

  it("keeps the remote URL next to the mirrored copy", async () => {
    // The mirror lives in the reclaimable cache dir while the tree snapshot
    // native persists does not, so the server URL has to survive as the fallback.
    const tree: BrowseTree = {
      "lib:albums": [collection("album:a1", "al-1")],
    };

    await localizeTreeArtwork(tree);

    expect(tree["lib:albums"][0]).toMatchObject({
      artworkUrl: remote("al-1"),
      localArtworkUrl: "file:///cache/car-artwork/al-1",
    });
  });

  it("skips covers already mirrored when the node was built", async () => {
    // A warm session resolves these in the node builders, so the first push to
    // the car is already local and this pass has nothing to add.
    const warm = collection("album:a1", "al-1");
    warm.localArtworkUrl = "file:///cache/car-artwork/al-1";
    const tree: BrowseTree = { "lib:albums": [warm] };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(false);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("inherits an album cover mirrored by an earlier build", async () => {
    // Nothing to download, but the track rows still need the album's local copy
    // — their own cover ids are never mirrored.
    registerAlbum("a1", "al-1");
    const local = "file:///cache/car-artwork/al-1";
    mockCached.mockImplementation((url) =>
      url === remote("al-1") ? local : undefined,
    );
    const tree: BrowseTree = {
      "album:a1": [track("track|album:a1|t1", "mf-1")],
    };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(true);
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(tree["album:a1"][0].localArtworkUrl).toBe(local);
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
    // Past the budget there's no local copy — the remote URL native falls back
    // to is all these keep, which is no worse than before.
    expect(tree["lib:albums"][3].localArtworkUrl).toBeUndefined();
    expect(tree["playlist:p1"][0].localArtworkUrl).toBeUndefined();
  });

  it("leaves a cover that can't be mirrored without a local copy", async () => {
    mockEnsure.mockResolvedValue(undefined);
    const tree: BrowseTree = {
      "lib:albums": [collection("album:a1", "al-1")],
    };

    const changed = await localizeTreeArtwork(tree);

    expect(changed).toBe(false);
    expect(tree["lib:albums"][0].localArtworkUrl).toBeUndefined();
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
    expect(tree["tab:home"][1].localArtworkUrl).toBeUndefined();
  });
});
