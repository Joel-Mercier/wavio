jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

import useOffline, { type OfflineTrack } from "@/stores/offline";

const get = () => useOffline.getState();

const makeTrack = (id: string, size = 1000): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  duration: 180,
  path: `/tmp/${id}.mp3`,
  size,
  downloadedAt: new Date().toISOString(),
});

beforeEach(() => {
  useOffline.setState(
    {
      offlineModeEnabled: false,
      downloadedTracks: {},
      downloadProgress: {},
      downloadQueue: [],
    },
    false,
  );
});

describe("offline store - settings", () => {
  it("toggles offlineModeEnabled", () => {
    get().setOfflineModeEnabled(true);
    expect(get().offlineModeEnabled).toBe(true);
    get().setOfflineModeEnabled(false);
    expect(get().offlineModeEnabled).toBe(false);
  });
});

describe("offline store - downloaded tracks", () => {
  it("adds and retrieves a track", () => {
    const t = makeTrack("a");
    get().addDownloadedTrack(t);
    expect(get().isTrackDownloaded("a")).toBe(true);
    expect(get().getDownloadedTrack("a")).toEqual(t);
    expect(get().getDownloadedTrack("missing")).toBeNull();
  });

  it("overwrites a track with same id", () => {
    get().addDownloadedTrack(makeTrack("a", 100));
    get().addDownloadedTrack(makeTrack("a", 500));
    expect(get().getDownloadedTrack("a")?.size).toBe(500);
    expect(get().getDownloadedTracksCount()).toBe(1);
  });

  it("removes a track", () => {
    get().addDownloadedTrack(makeTrack("a"));
    get().addDownloadedTrack(makeTrack("b"));
    get().removeDownloadedTrack("a");
    expect(get().isTrackDownloaded("a")).toBe(false);
    expect(get().isTrackDownloaded("b")).toBe(true);
  });

  it("getTotalDownloadSize sums sizes", () => {
    get().addDownloadedTrack(makeTrack("a", 100));
    get().addDownloadedTrack(makeTrack("b", 250));
    expect(get().getTotalDownloadSize()).toBe(350);
  });

  it("getDownloadedTracksList returns all values", () => {
    get().addDownloadedTrack(makeTrack("a"));
    get().addDownloadedTrack(makeTrack("b"));
    const list = get().getDownloadedTracksList();
    expect(list.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("clearAllDownloads wipes tracks, progress and queue", () => {
    get().addDownloadedTrack(makeTrack("a"));
    get().setDownloadProgress("a", {
      trackId: "a",
      status: "completed",
      progress: 100,
    });
    get().addToDownloadQueue("b");
    get().clearAllDownloads();
    expect(get().getDownloadedTracksCount()).toBe(0);
    expect(get().downloadProgress).toEqual({});
    expect(get().downloadQueue).toEqual([]);
  });
});

describe("offline store - progress", () => {
  it("sets and removes progress", () => {
    get().setDownloadProgress("a", {
      trackId: "a",
      status: "downloading",
      progress: 42,
    });
    expect(get().downloadProgress.a.progress).toBe(42);
    get().removeDownloadProgress("a");
    expect(get().downloadProgress.a).toBeUndefined();
  });
});

describe("offline store - download queue", () => {
  it("adds without duplicates and removes", () => {
    get().addToDownloadQueue("a");
    get().addToDownloadQueue("a");
    get().addToDownloadQueue("b");
    expect(get().downloadQueue).toEqual(["a", "b"]);
    get().removeFromDownloadQueue("a");
    expect(get().downloadQueue).toEqual(["b"]);
  });

  it("clearDownloadQueue empties the queue", () => {
    get().addToDownloadQueue("a");
    get().addToDownloadQueue("b");
    get().clearDownloadQueue();
    expect(get().downloadQueue).toEqual([]);
  });
});
