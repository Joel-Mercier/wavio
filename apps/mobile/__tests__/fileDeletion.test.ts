// The orchestration around a permanent delete: what leaves the queue first and
// comes back when its delete didn't go through, how a partial failure and a
// cancel are reported, and which local traces are dropped only once an album
// is really gone.

const mockDeleteTrack = jest.fn();
const mockRefreshAfterDelete = jest.fn(async (_ids: string[]) => false);
jest.mock("@/services/backend/deletion", () => ({
  deleteTrack: (id: string) => mockDeleteTrack(id),
  deleteConcurrency: () => 2,
  refreshAfterDelete: (ids: string[]) => mockRefreshAfterDelete(ids),
}));

const mockGetAlbum = jest.fn();
const mockGetArtist = jest.fn();
jest.mock("@/services/backend/browsing", () => ({
  getAlbum: (id: string) => mockGetAlbum(id),
  getArtist: (id: string) => mockGetArtist(id),
}));

jest.mock("@/services/backend/dispatch", () => ({
  activeServerType: () => "webdav",
}));

jest.mock("@/services/openSubsonic", () => ({
  isSubsonicDataNotFound: () => false,
  isSubsonicNotAuthorized: () => false,
}));

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

const mockInvalidate = jest.fn();
jest.mock("@/config/queryClient", () => ({
  queryClient: {
    invalidateQueries: (filters: unknown) => mockInvalidate(filters),
  },
}));

const mockOffline = {
  cancelQueuedTracks: jest.fn((ids: string[]) => {
    mockOfflineState.downloadQueue = mockOfflineState.downloadQueue.filter(
      (track) => !ids.includes(track.id),
    );
  }),
  enqueueTracks: jest.fn(),
  removeDownloadedTracks: jest.fn(() => Promise.resolve()),
  removeCollection: jest.fn(() => Promise.resolve()),
};
jest.mock("@/services/offline/downloadService", () => ({
  get offlineDownloadService() {
    return mockOffline;
  },
}));

const mockRemoveFromQueue = jest.fn();
const mockRestoreSome = jest.fn();
jest.mock("@/services/queuePrune", () => ({
  removeFromQueueWhere: (
    predicate: (track: { id: string }) => boolean,
    options: unknown,
  ) => mockRemoveFromQueue(predicate, options),
  restoreSomeToQueue: (
    removed: unknown,
    keep: (track: { id: string }) => boolean,
  ) => mockRestoreSome(removed, keep),
}));

const mockRestoreServerQueue = jest.fn();
const mockPlayer = { position: 0 };
jest.mock("@/services/player", () => ({
  getCurrentTime: () => mockPlayer.position,
  restoreServerQueue: (...args: unknown[]) => mockRestoreServerQueue(...args),
}));

const mockQueueState = {
  queue: [] as { id: string }[],
  currentIndex: null as number | null,
};
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => mockQueueState },
}));

type Collection = {
  id: string;
  kind: "album" | "playlist";
  trackIds: string[];
  songCount: number;
};
const mockOfflineState = {
  downloadedTracks: {} as Record<string, unknown>,
  downloadedCollections: {} as Record<string, Collection>,
  downloadQueue: [] as { id: string; offlineSource?: string }[],
  addDownloadedCollections: jest.fn(),
};
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => mockOfflineState },
}));

const mockHidden = {
  tracks: {} as Record<string, unknown>,
  unhideTrack: jest.fn(),
};
jest.mock("@/stores/hiddenTracks", () => ({
  __esModule: true,
  default: { getState: () => mockHidden },
}));

const mockRemoveRecentPlay = jest.fn();
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { getState: () => ({ removeRecentPlay: mockRemoveRecentPlay }) },
}));

import { AxiosError } from "axios";
import { deleteTracks, tracksOfArtist } from "@/services/fileDeletion";
import { FileSourceError } from "@/services/fileSource/errors";
import { LocalNotFoundError } from "@/services/local/notFoundError";

const tracks = (...ids: string[]) =>
  ids.map((id) => ({ id, albumId: `album-${id}` }));
const ofAlbum = (albumId: string, ...ids: string[]) =>
  ids.map((id) => ({ id, albumId }));
const refuse = (...refused: string[]) =>
  mockDeleteTrack.mockImplementation(async (id: string) => {
    if (refused.includes(id)) {
      throw new FileSourceError("ERR_FS_READ_ONLY", `DELETE ${id}: HTTP 403`);
    }
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteTrack.mockResolvedValue(undefined);
  mockRemoveFromQueue.mockReturnValue([]);
  mockGetAlbum.mockResolvedValue({ album: { song: [{ id: "other" }] } });
  mockOfflineState.downloadedTracks = {};
  mockOfflineState.downloadedCollections = {};
  mockOfflineState.downloadQueue = [];
  mockQueueState.queue = [];
  mockQueueState.currentIndex = null;
  mockHidden.tracks = {};
});

describe("deleteTracks", () => {
  it("takes the tracks out of both queues before deleting anything", async () => {
    mockOfflineState.downloadQueue = [{ id: "a" }, { id: "z" }];
    mockRemoveFromQueue.mockImplementation(() => {
      expect(mockDeleteTrack).not.toHaveBeenCalled();
      return [];
    });
    await deleteTracks(tracks("a", "b"));
    const [predicate, options] = mockRemoveFromQueue.mock.calls[0];
    expect(predicate({ id: "a" })).toBe(true);
    expect(predicate({ id: "c" })).toBe(false);
    // The file is gone, so a current track with nothing after it can't stay.
    expect(options).toEqual({ whenNothingFollows: "stop" });
    expect(mockOffline.cancelQueuedTracks).toHaveBeenCalledWith(["a"]);
  });

  it("reports progress for every file and each id once", async () => {
    const progress: number[] = [];
    const result = await deleteTracks([...tracks("a", "b"), ...tracks("a")], {
      onProgress: ({ done }) => progress.push(done),
    });
    expect(result.deleted.sort()).toEqual(["a", "b"]);
    expect(progress).toEqual([0, 1, 2]);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("refreshes only queries a deleted file can change", async () => {
    await deleteTracks(tracks("a"));
    const { predicate } = mockInvalidate.mock.calls[0][0];
    expect(predicate({ queryKey: ["album", "x"] })).toBe(true);
    expect(predicate({ queryKey: ["albumList2:infinite", {}] })).toBe(true);
    expect(predicate({ queryKey: ["getLyricsBySongId", "a"] })).toBe(false);
    expect(predicate({ queryKey: ["lastfm", "user"] })).toBe(false);
  });

  it("keeps going past a failure and says why it failed", async () => {
    refuse("b");
    const result = await deleteTracks(ofAlbum("album-1", "a", "b", "c"), {
      collectionId: "album-1",
    });
    expect(result.deleted.sort()).toEqual(["a", "c"]);
    expect(result.failed).toEqual([{ id: "b", reason: "notAllowed" }]);
    // A refusal is user state, not a bug.
    expect(mockReportError).not.toHaveBeenCalled();
    // The album isn't gone, so its shortcut stays.
    expect(mockRemoveRecentPlay).not.toHaveBeenCalled();
  });

  it("puts back in the queue what couldn't be deleted", async () => {
    refuse("b");
    const removed = [{ track: { id: "a" } }, { track: { id: "b" } }];
    mockRemoveFromQueue.mockImplementation(() => {
      mockQueueState.queue = [{ id: "z" }];
      mockQueueState.currentIndex = 0;
      return removed;
    });
    await deleteTracks(tracks("a", "b"));
    const [entries, keep] = mockRestoreSome.mock.calls[0];
    expect(entries).toBe(removed);
    expect(keep({ id: "b" })).toBe(true);
    expect(keep({ id: "a" })).toBe(false);
  });

  it("doesn't restore into a queue the user replaced meanwhile", async () => {
    refuse("a");
    mockRemoveFromQueue.mockImplementation(() => {
      mockQueueState.queue = [{ id: "z" }];
      mockQueueState.currentIndex = 0;
      return [{ track: { id: "a" } }];
    });
    mockDeleteTrack.mockImplementation(async () => {
      mockQueueState.queue = [{ id: "new" }];
      throw new FileSourceError("ERR_FS_READ_ONLY", "nope");
    });
    await deleteTracks(tracks("a"));
    expect(mockRestoreSome).not.toHaveBeenCalled();
  });

  describe("when the delete emptied the queue", () => {
    const emptyOnRemoval = (queue: string[], currentIndex: number) => {
      mockQueueState.queue = queue.map((id) => ({ id }));
      mockQueueState.currentIndex = currentIndex;
      mockRemoveFromQueue.mockImplementation(() => {
        mockQueueState.queue = [];
        mockQueueState.currentIndex = null;
        return [];
      });
    };

    it("puts the songs that survived back, paused where it was", async () => {
      emptyOnRemoval(["x", "a", "b"], 1);
      mockPlayer.position = 42;
      refuse("a");
      await deleteTracks(tracks("a", "b"));
      expect(mockRestoreServerQueue).toHaveBeenCalledWith(
        [{ id: "x" }, { id: "a" }],
        1,
        42,
      );
      expect(mockRestoreSome).not.toHaveBeenCalled();
    });

    it("lands on the next survivor when the current song is gone", async () => {
      emptyOnRemoval(["a", "b"], 0);
      mockPlayer.position = 42;
      refuse("b");
      await deleteTracks(tracks("a", "b"));
      expect(mockRestoreServerQueue).toHaveBeenCalledWith([{ id: "b" }], 0, 0);
    });

    it("leaves it empty when every song was deleted", async () => {
      emptyOnRemoval(["a"], 0);
      await deleteTracks(tracks("a"));
      expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    });

    it("leaves alone what the user started meanwhile", async () => {
      emptyOnRemoval(["a"], 0);
      mockDeleteTrack.mockImplementation(async () => {
        mockQueueState.queue = [{ id: "new" }];
        mockQueueState.currentIndex = 0;
        throw new FileSourceError("ERR_FS_READ_ONLY", "nope");
      });
      await deleteTracks(tracks("a"));
      expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    });
  });

  it("re-queues the downloads of what couldn't be deleted", async () => {
    refuse("b", "c");
    mockOfflineState.downloadQueue = [
      { id: "a", offlineSource: "user" },
      { id: "b", offlineSource: "rule" },
      { id: "c" },
    ];
    await deleteTracks(tracks("a", "b", "c"));
    expect(mockOffline.enqueueTracks).toHaveBeenCalledWith(
      [{ id: "b", offlineSource: "rule" }],
      "rule",
    );
    expect(mockOffline.enqueueTracks).toHaveBeenCalledWith(
      [{ id: "c" }],
      "user",
    );
    expect(mockOffline.enqueueTracks).toHaveBeenCalledTimes(2);
  });

  it("tells a file open elsewhere apart from a refusal", async () => {
    mockDeleteTrack.mockRejectedValue(
      new FileSourceError("ERR_FS_IN_USE", "sharing violation"),
    );
    const result = await deleteTracks(tracks("a"));
    expect(result.failed).toEqual([{ id: "a", reason: "inUse" }]);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure once", async () => {
    mockDeleteTrack.mockRejectedValue(
      new FileSourceError("ERR_FS_SERVER", "boom"),
    );
    const result = await deleteTracks(tracks("a", "b"));
    expect(result.failed.map((f) => f.reason)).toEqual(["other", "other"]);
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("blames a server error on the server, without reporting it", async () => {
    mockDeleteTrack.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 500",
        "500",
        undefined,
        null,
        {
          status: 500,
        } as never,
      ),
    );
    const result = await deleteTracks(tracks("a", "b"));
    expect(result.failed.map((f) => f.reason)).toEqual([
      "serverError",
      "serverError",
    ]);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("stops starting new deletes once cancelled", async () => {
    let cancelled = false;
    mockDeleteTrack.mockImplementation(async () => {
      cancelled = true;
    });
    const result = await deleteTracks(tracks("a", "b", "c", "d"), {
      isCancelled: () => cancelled,
    });
    // The delete in flight finishes; nothing after it starts.
    expect(result.deleted).toEqual(["a"]);
    expect(mockDeleteTrack).toHaveBeenCalledTimes(1);
    expect(result.cancelled).toBe(true);
  });

  it("drops the downloads and hidden entries of what was deleted", async () => {
    mockOfflineState.downloadedTracks = { a: {} };
    mockHidden.tracks = { b: {} };
    await deleteTracks(tracks("a", "b"));
    expect(mockOffline.removeDownloadedTracks).toHaveBeenCalledWith(["a"]);
    expect(mockHidden.unhideTrack).toHaveBeenCalledWith("b");
  });

  it("forgets an album only once all of it is deleted", async () => {
    mockOfflineState.downloadedCollections = {
      "album-1": {
        id: "album-1",
        kind: "album",
        trackIds: ["a", "b"],
        songCount: 2,
      },
    };
    await deleteTracks(ofAlbum("album-1", "a", "b"), {
      collectionId: "album-1",
    });
    expect(mockRemoveRecentPlay).toHaveBeenCalledWith("album-1");
    expect(mockOffline.removeCollection).toHaveBeenCalledWith("album-1", []);
  });

  it("forgets every album an artist delete emptied", async () => {
    refuse("c");
    mockOfflineState.downloadedCollections = {
      al1: { id: "al1", kind: "album", trackIds: ["a", "b"], songCount: 2 },
      al2: { id: "al2", kind: "album", trackIds: ["c", "d"], songCount: 2 },
    };
    await deleteTracks(
      [...ofAlbum("al1", "a", "b"), ...ofAlbum("al2", "c", "d")],
      {
        collectionId: "artist-1",
      },
    );
    expect(mockRemoveRecentPlay).toHaveBeenCalledWith("al1");
    expect(mockRemoveRecentPlay).not.toHaveBeenCalledWith("al2");
    // Not the artist: one of its songs is still there.
    expect(mockRemoveRecentPlay).not.toHaveBeenCalledWith("artist-1");
    expect(mockOffline.removeCollection).toHaveBeenCalledWith("al1", []);
    expect(mockOfflineState.addDownloadedCollections).toHaveBeenCalledWith([
      { id: "al2", kind: "album", trackIds: ["c"], songCount: 1 },
    ]);
    // The artist's listing covered whole albums: nothing to ask.
    expect(mockGetAlbum).not.toHaveBeenCalled();
  });

  it("keeps a playlist that lost all its saved songs", async () => {
    mockOfflineState.downloadedCollections = {
      p1: { id: "p1", kind: "playlist", trackIds: ["a"], songCount: 1 },
    };
    await deleteTracks(tracks("a"));
    expect(mockOffline.removeCollection).not.toHaveBeenCalled();
    expect(mockOfflineState.addDownloadedCollections).toHaveBeenCalledWith([
      { id: "p1", kind: "playlist", trackIds: [], songCount: 0 },
    ]);
  });

  it("asks the library whether picked tracks emptied their album", async () => {
    mockGetAlbum.mockImplementation(async (id: string) => {
      if (id === "al1") return { album: { song: [] } };
      if (id === "al2") return { album: { song: [{ id: "x" }] } };
      if (id === "al4") throw new LocalNotFoundError(`album "${id}"`);
      throw new Error("network down");
    });
    await deleteTracks([
      ...ofAlbum("al1", "a"),
      ...ofAlbum("al2", "b"),
      ...ofAlbum("al3", "c"),
      ...ofAlbum("al4", "d"),
    ]);
    expect(mockRemoveRecentPlay.mock.calls).toEqual([["al1"], ["al4"]]);
  });

  it("lets the server drop the albums it emptied, then refetches", async () => {
    mockRefreshAfterDelete.mockResolvedValueOnce(true);
    await deleteTracks([...ofAlbum("al1", "a", "b"), ...ofAlbum("al2", "c")], {
      collectionId: "artist-1",
    });
    expect(mockRefreshAfterDelete).toHaveBeenCalledWith(["al1", "al2"]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockInvalidate).toHaveBeenCalledTimes(2);
  });

  it("leaves the server alone when no album was emptied", async () => {
    mockGetAlbum.mockResolvedValue({ album: { song: [{ id: "x" }] } });
    await deleteTracks(ofAlbum("al1", "a"));
    expect(mockRefreshAfterDelete).not.toHaveBeenCalled();
  });
});

describe("tracksOfArtist", () => {
  it("collects every track of the artist's albums once", async () => {
    mockGetArtist.mockResolvedValue({
      artist: { album: [{ id: "al1" }, { id: "al2" }] },
    });
    mockGetAlbum.mockImplementation(async (id: string) => ({
      album: {
        song:
          id === "al1"
            ? [{ id: "t1" }, { id: "t2" }]
            : [{ id: "t2" }, { id: "t3" }],
      },
    }));
    const tracks = await tracksOfArtist("ar1");
    expect(tracks.map((track) => track.id)).toEqual(["t1", "t2", "t3"]);
  });
});
