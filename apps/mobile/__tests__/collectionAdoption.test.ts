jest.mock("@/config/storage", () => {
  const make = () => {
    const mem = new Map<string, string>();
    return {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    };
  };
  return {
    createDynamicScopedStorage: () => make(),
    createThrottledScopedJSONStorage: () =>
      jest.requireActual("zustand/middleware").createJSONStorage(() => make()),
    flushPendingScopedWrites: () => {},
  };
});

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

const mockGetQueriesData = jest.fn();
const mockGetQueryData = jest.fn();
jest.mock("@/config/queryClient", () => ({
  queryClient: {
    getQueriesData: (...args: unknown[]) => mockGetQueriesData(...args),
    getQueryData: (...args: unknown[]) => mockGetQueryData(...args),
  },
}));

const mockGetAlbum = jest.fn();
jest.mock("@/services/backend/browsing", () => ({
  getAlbum: (id: string) => mockGetAlbum(id),
}));

const mockGetPlaylist = jest.fn();
jest.mock("@/services/backend/playlists", () => ({
  getPlaylist: (id: string) => mockGetPlaylist(id),
}));

let mockOnline = true;
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
}));

const mockEnqueueArtwork = jest.fn();
const mockCacheTrackArtwork = jest.fn();
jest.mock("@/services/offline/artworkCacheService", () => ({
  artworkCacheService: {
    enqueue: (coverArt?: string) => mockEnqueueArtwork(coverArt),
  },
  cacheArtworkForTracks: (songs: unknown) => mockCacheTrackArtwork(songs),
}));

const mockRemoving = new Set<string>();
jest.mock("@/services/offline/downloadService", () => ({
  offlineDownloadService: {
    isRemovingCollection: (id: string) => mockRemoving.has(id),
  },
}));

let mockExtendedOffline = false;
jest.mock("@/stores/librarySync", () => ({
  __esModule: true,
  default: {
    getState: () => ({ extendedOfflineModeEnabled: mockExtendedOffline }),
  },
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

import {
  __resetCollectionAdoption,
  adoptDownloadedAlbums,
  adoptDownloadedPlaylists,
  subscribeCollectionAdoption,
} from "@/services/offline/collectionAdoption";
import type { AlbumID3, Child, Playlist } from "@/services/openSubsonic/types";
import useOffline, { type OfflineTrack } from "@/stores/offline";
import usePlaylistsStore from "@/stores/playlists";

const makeTrack = (id: string, albumId?: string): OfflineTrack => ({
  id,
  albumId,
  title: `Track ${id}`,
  duration: 180,
  path: `/tmp/${id}.mp3`,
  size: 1000,
  downloadedAt: "2026-10-18T00:00:00.000Z",
});

const makeChild = (id: string): Child => ({
  id,
  isDir: false,
  title: `Track ${id}`,
});

const makePlaylist = (
  id: string,
  songCount: number,
  changed = "2026-10-18T00:00:00.000Z",
): Playlist => ({
  id,
  name: `Playlist ${id}`,
  coverArt: `pl-${id}`,
  owner: "joel",
  songCount,
  duration: 0,
  created: new Date("2026-01-01T00:00:00.000Z"),
  changed: new Date(changed),
});

const serve = (members: Record<string, string[]>) => {
  mockGetPlaylist.mockImplementation(async (id: string) => ({
    playlist: {
      ...makePlaylist(id, members[id].length),
      entry: members[id].map(makeChild),
    },
  }));
};

const download = (...ids: string[]) =>
  useOffline.getState().addDownloadedTracks(ids.map((id) => makeTrack(id)));

const collections = () => useOffline.getState().downloadedCollections;

describe("collection adoption", () => {
  beforeEach(() => {
    useOffline.getState().__reset();
    usePlaylistsStore.setState({ deletedPlaylists: {} });
    __resetCollectionAdoption();
    mockGetPlaylist.mockReset();
    mockGetAlbum.mockReset();
    mockGetQueriesData.mockReset();
    mockGetQueryData.mockReset();
    mockEnqueueArtwork.mockReset();
    mockCacheTrackArtwork.mockReset();
    mockRemoving.clear();
    mockOnline = true;
    mockExtendedOffline = false;
  });

  it("registers a playlist whose tracks are all downloaded", async () => {
    download("t1", "t2", "t3");
    serve({ p1: ["t2", "t1"] });

    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    expect(collections().p1).toMatchObject({
      id: "p1",
      kind: "playlist",
      name: "Playlist p1",
      coverArt: "pl-p1",
      owner: "joel",
      trackIds: ["t2", "t1"],
      songCount: 2,
    });
    expect(collections().p1.source).toBeUndefined();
    expect(mockEnqueueArtwork).toHaveBeenCalledWith("pl-p1");
    expect(mockCacheTrackArtwork).toHaveBeenCalledTimes(1);
  });

  it("leaves a partially downloaded playlist alone", async () => {
    download("t1", "t2");
    serve({ p1: ["t1", "t9"] });

    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    expect(collections().p1).toBeUndefined();
  });

  it("never fetches playlists that can't be fully downloaded", async () => {
    download("t1");
    useOffline.getState().addDownloadedCollection({
      id: "saved",
      kind: "playlist",
      name: "Saved",
      songCount: 1,
      trackIds: ["t1"],
      savedAt: "2026-10-18T00:00:00.000Z",
    });
    usePlaylistsStore.setState({ deletedPlaylists: { gone: true } });
    mockRemoving.add("removing");

    await adoptDownloadedPlaylists([
      makePlaylist("empty", 0),
      makePlaylist("bigger", 2),
      makePlaylist("saved", 1),
      makePlaylist("gone", 1),
      makePlaylist("removing", 1),
    ]);

    expect(mockGetPlaylist).not.toHaveBeenCalled();
  });

  it("does nothing without downloads, offline, or under extended offline mode", async () => {
    serve({ p1: ["t1"] });
    await adoptDownloadedPlaylists([makePlaylist("p1", 1)]);

    download("t1");
    mockOnline = false;
    await adoptDownloadedPlaylists([makePlaylist("p1", 1)]);

    mockOnline = true;
    mockExtendedOffline = true;
    await adoptDownloadedPlaylists([makePlaylist("p1", 1)]);

    expect(mockGetPlaylist).not.toHaveBeenCalled();
    expect(collections().p1).toBeUndefined();
  });

  it("stops registering once extended offline mode is turned on mid-run", async () => {
    download("t1", "t2");
    mockGetPlaylist.mockImplementation(async (id: string) => {
      mockExtendedOffline = true;
      return {
        playlist: { ...makePlaylist(id, 1), entry: [makeChild("t1")] },
      };
    });

    await adoptDownloadedPlaylists([
      makePlaylist("p1", 1),
      makePlaylist("p2", 1),
    ]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(1);
    expect(collections().p1).toBeUndefined();
    expect(collections().p2).toBeUndefined();
  });

  it("doesn't refetch an incomplete playlist while its missing track is still missing", async () => {
    download("t1", "t0");
    serve({ p1: ["t1", "t2"] });

    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);
    expect(useOffline.getState().incompleteCollections["playlist|p1"]).toEqual({
      version: expect.any(String),
      missingTrackId: "t2",
    });

    __resetCollectionAdoption();
    download("t3");
    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(1);
    expect(collections().p1).toBeUndefined();
  });

  it("re-checks once the missing track is downloaded", async () => {
    download("t1", "t0");
    serve({ p1: ["t1", "t2"] });
    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    download("t2");
    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(2);
    expect(collections().p1?.trackIds).toEqual(["t1", "t2"]);
    expect(
      useOffline.getState().incompleteCollections["playlist|p1"],
    ).toBeUndefined();
  });

  it("re-checks once the listing says the playlist changed", async () => {
    download("t1");
    serve({ p1: ["t1", "t2"] });
    await adoptDownloadedPlaylists([makePlaylist("p1", 1)]);

    serve({ p1: ["t1"] });
    await adoptDownloadedPlaylists([
      makePlaylist("p1", 1, "2026-10-19T00:00:00.000Z"),
    ]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(2);
    expect(collections().p1?.trackIds).toEqual(["t1"]);
  });

  it("records the version the fetch returned, not the listing's", async () => {
    download("t1", "t0");
    mockGetPlaylist.mockImplementation(async (id: string) => ({
      playlist: {
        ...makePlaylist(id, 2, "2026-10-19T00:00:00.000Z"),
        entry: [makeChild("t1"), makeChild("t2")],
      },
    }));

    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);
    await adoptDownloadedPlaylists([
      makePlaylist("p1", 2, "2026-10-19T00:00:00.000Z"),
    ]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(1);
  });

  it("never registers a membership it didn't just fetch", async () => {
    download("t1", "t2");
    serve({ p1: ["t1", "t2"] });
    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);
    useOffline.getState().removeDownloadedCollection("p1");

    serve({ p1: ["t1", "t9"] });
    await adoptDownloadedPlaylists([makePlaylist("p1", 2)]);

    expect(mockGetPlaylist).toHaveBeenCalledTimes(2);
    expect(collections().p1).toBeUndefined();
  });

  it("keeps checking the rest when one playlist fails to load", async () => {
    download("t1");
    mockGetPlaylist.mockImplementation(async (id: string) => {
      if (id === "broken") throw new Error("500");
      return { playlist: { ...makePlaylist(id, 1), entry: [makeChild("t1")] } };
    });

    await adoptDownloadedPlaylists([
      makePlaylist("broken", 1),
      makePlaylist("p1", 1),
    ]);

    expect(collections().broken).toBeUndefined();
    expect(collections().p1).toBeDefined();
  });

  it("runs a listing that arrives mid-run once the current run ends", async () => {
    download("t1");
    let release: () => void = () => {};
    mockGetPlaylist.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              playlist: { ...makePlaylist("p1", 1), entry: [makeChild("t1")] },
            });
        }),
    );
    const first = adoptDownloadedPlaylists([makePlaylist("p1", 1)]);
    serve({ p2: ["t1"] });
    await adoptDownloadedPlaylists([makePlaylist("p2", 1)]);
    expect(collections().p2).toBeUndefined();

    release();
    await first;

    expect(collections().p1).toBeDefined();
    expect(collections().p2).toBeDefined();
  });

  it("re-checks the cached listings once the download queue drains", async () => {
    mockGetQueriesData.mockReturnValue([
      [["playlists", {}], { playlists: { playlist: [makePlaylist("p1", 1)] } }],
    ]);
    serve({ p1: ["t1"] });
    const unsubscribe = subscribeCollectionAdoption();

    useOffline.getState().addToDownloadQueue(makeChild("t1"));
    expect(mockGetPlaylist).not.toHaveBeenCalled();
    useOffline.getState().completeDownloads([makeTrack("t1")]);
    unsubscribe();
    await new Promise((resolve) => setImmediate(resolve));

    expect(collections().p1?.trackIds).toEqual(["t1"]);
  });

  describe("starred albums", () => {
    const makeAlbum = (id: string, songCount: number): AlbumID3 => ({
      id,
      name: `Album ${id}`,
      coverArt: `al-${id}`,
      artist: "Pink Floyd",
      artistId: "ar1",
      artists: [{ id: "ar1", name: "Pink Floyd" }],
      year: 1973,
      songCount,
      duration: 0,
      created: new Date("2026-01-01T00:00:00.000Z"),
    });

    const serveAlbums = (members: Record<string, string[]>) => {
      mockGetAlbum.mockImplementation(async (id: string) => ({
        album: {
          ...makeAlbum(id, members[id].length),
          song: members[id].map(makeChild),
        },
      }));
    };

    const downloadIn = (albumId: string, ...ids: string[]) =>
      useOffline
        .getState()
        .addDownloadedTracks(ids.map((id) => makeTrack(id, albumId)));

    it("registers a starred album whose tracks are all downloaded", async () => {
      downloadIn("a1", "t1", "t2");
      serveAlbums({ a1: ["t1", "t2"] });

      await adoptDownloadedAlbums([makeAlbum("a1", 2)]);

      expect(collections().a1).toMatchObject({
        id: "a1",
        kind: "album",
        name: "Album a1",
        coverArt: "al-a1",
        artist: "Pink Floyd",
        artistId: "ar1",
        artists: [{ id: "ar1", name: "Pink Floyd" }],
        year: 1973,
        trackIds: ["t1", "t2"],
        songCount: 2,
      });
      expect(mockEnqueueArtwork).toHaveBeenCalledWith("al-a1");
    });

    it("only fetches albums with enough of their own tracks downloaded", async () => {
      downloadIn("a1", "t1");
      download("t2", "t3");
      serveAlbums({ a1: ["t1", "t2"] });

      await adoptDownloadedAlbums([makeAlbum("a1", 2)]);

      expect(mockGetAlbum).not.toHaveBeenCalled();
      expect(collections().a1).toBeUndefined();
    });

    it("re-checks an incomplete album once more of its tracks are downloaded", async () => {
      downloadIn("a1", "t1", "t2");
      serveAlbums({ a1: ["t1", "t8"] });
      await adoptDownloadedAlbums([makeAlbum("a1", 2)]);
      await adoptDownloadedAlbums([makeAlbum("a1", 2)]);
      expect(mockGetAlbum).toHaveBeenCalledTimes(1);

      serveAlbums({ a1: ["t1", "t3"] });
      downloadIn("a1", "t3");
      await adoptDownloadedAlbums([makeAlbum("a1", 2)]);

      expect(mockGetAlbum).toHaveBeenCalledTimes(2);
      expect(collections().a1?.trackIds).toEqual(["t1", "t3"]);
    });

    it("re-checks cached starred albums once the download queue drains", async () => {
      mockGetQueriesData.mockReturnValue([]);
      mockGetQueryData.mockReturnValue({
        starred2: { album: [makeAlbum("a1", 1)] },
      });
      serveAlbums({ a1: ["t1"] });
      const unsubscribe = subscribeCollectionAdoption();

      useOffline.getState().addToDownloadQueue(makeChild("t1"));
      useOffline.getState().completeDownloads([makeTrack("t1", "a1")]);
      unsubscribe();
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockGetQueryData).toHaveBeenCalledWith(["starred2"]);
      expect(collections().a1?.trackIds).toEqual(["t1"]);
    });
  });
});
