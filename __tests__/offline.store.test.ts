jest.mock("@/config/storage", () => {
  const g = globalThis as unknown as { __offlineMockMem?: Map<string, string> };
  if (!g.__offlineMockMem) g.__offlineMockMem = new Map<string, string>();
  const mem = g.__offlineMockMem;
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

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import type { Child } from "@/services/openSubsonic/types";
import useOffline, { type OfflineTrack } from "@/stores/offline";

const get = () => useOffline.getState();

const mockMem = (
  globalThis as unknown as { __offlineMockMem: Map<string, string> }
).__offlineMockMem;

const makeTrack = (id: string, size = 1000): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  duration: 180,
  path: `/tmp/${id}.mp3`,
  size,
  downloadedAt: new Date().toISOString(),
});

const makeChild = (id: string, overrides: Partial<Child> = {}): Child => ({
  id,
  isDir: false,
  title: `Track ${id}`,
  suffix: "mp3",
  duration: 180,
  size: 1000,
  ...overrides,
});

beforeEach(() => {
  mockMem.clear();
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
    get().addToDownloadQueue(makeChild("b"));
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

  it("setDownloadProgress overwrites the existing entry for that id", () => {
    get().setDownloadProgress("a", {
      trackId: "a",
      status: "downloading",
      progress: 10,
    });
    get().setDownloadProgress("a", {
      trackId: "a",
      status: "completed",
      progress: 100,
    });
    expect(get().downloadProgress.a).toEqual({
      trackId: "a",
      status: "completed",
      progress: 100,
    });
  });

  it("clearFailedDownloads removes only failed entries", () => {
    get().setDownloadProgress("a", {
      trackId: "a",
      status: "failed",
      progress: 0,
      error: "boom",
    });
    get().setDownloadProgress("b", {
      trackId: "b",
      status: "completed",
      progress: 100,
    });
    get().setDownloadProgress("c", {
      trackId: "c",
      status: "downloading",
      progress: 50,
    });
    get().clearFailedDownloads();
    expect(get().downloadProgress.a).toBeUndefined();
    expect(get().downloadProgress.b?.status).toBe("completed");
    expect(get().downloadProgress.c?.status).toBe("downloading");
  });
});

describe("offline store - download queue", () => {
  it("adds without duplicates and removes by id", () => {
    get().addToDownloadQueue(makeChild("a"));
    get().addToDownloadQueue(makeChild("a"));
    get().addToDownloadQueue(makeChild("b"));
    expect(get().downloadQueue.map((t) => t.id)).toEqual(["a", "b"]);
    get().removeFromDownloadQueue("a");
    expect(get().downloadQueue.map((t) => t.id)).toEqual(["b"]);
  });

  it("preserves full Child data so resumable downloads have what they need", () => {
    const child = makeChild("a", {
      suffix: "flac",
      size: 12345,
      artist: "X",
      album: "Y",
    });
    get().addToDownloadQueue(child);
    expect(get().downloadQueue[0]).toEqual(child);
  });

  it("removeFromDownloadQueue is a no-op for an unknown id", () => {
    get().addToDownloadQueue(makeChild("a"));
    get().removeFromDownloadQueue("missing");
    expect(get().downloadQueue.map((t) => t.id)).toEqual(["a"]);
  });

  it("clearDownloadQueue empties the queue", () => {
    get().addToDownloadQueue(makeChild("a"));
    get().addToDownloadQueue(makeChild("b"));
    get().clearDownloadQueue();
    expect(get().downloadQueue).toEqual([]);
  });
});

describe("offline store - persistence", () => {
  it("rehydrates downloadedTracks, downloadProgress and downloadQueue", async () => {
    const child = makeChild("a", { suffix: "flac" });
    mockMem.set(
      "offlineStore",
      JSON.stringify({
        state: {
          offlineModeEnabled: true,
          downloadedTracks: { x: makeTrack("x") },
          downloadQueue: [child],
          downloadProgress: {
            a: { trackId: "a", status: "failed", progress: 0, error: "boom" },
          },
        },
        version: 0,
      }),
    );

    await useOffline.persist.rehydrate();
    const state = get();

    expect(state.offlineModeEnabled).toBe(true);
    expect(state.downloadedTracks.x?.id).toBe("x");
    expect(state.downloadQueue).toEqual([child]);
    expect(state.downloadProgress.a?.status).toBe("failed");
  });
});
