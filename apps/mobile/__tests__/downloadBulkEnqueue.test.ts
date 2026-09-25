// Every offline store write re-serializes the whole persisted store, so a
// collection save must cost a constant number of writes however many tracks it
// holds — two per track froze the JS thread for 17 minutes on a 5000-track
// playlist (issue #205). The per-track promise contract saveAll awaits has to
// survive the batching.
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
    createThrottledScopedJSONStorage: () =>
      jest.requireActual("zustand/middleware").createJSONStorage(() => make()),
    flushPendingScopedWrites: () => {},
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "https://server", username: "n" }) },
  currentAuthScope: () => "scope",
}));

jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => ({ downloadsWifiOnly: false }) },
}));

jest.mock("@/stores/librarySync", () => ({
  useLibrarySyncBase: {
    getState: () => ({ extendedOfflineModeEnabled: true }),
  },
}));

jest.mock("@/services/network", () => ({
  getConnectionType: () => "wifi",
  getIsEffectivelyOnline: () => true,
  subscribeConnectionType: () => () => {},
  subscribeEffectiveOnline: () => () => {},
}));

jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
  isTlsTrustFailure: () => false,
}));
jest.mock("@/utils/log", () => ({ logError: jest.fn() }));
jest.mock("@/services/backend/streaming", () => ({
  offlineFileInfo: (track: { id: string }) => ({
    url: `https://server/stream/${track.id}`,
    suffix: "mp3",
  }),
}));
jest.mock("@/services/offline/collections", () => ({
  trackIdsReferencedByCollections: () => new Set<string>(),
}));

const mockDownload = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: async () => {},
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "/doc" },
  Directory: class {
    exists = true;
    create() {}
    delete() {}
  },
  File: class {
    exists = false;
    constructor(..._args: unknown[]) {}
    delete() {}
    static downloadFileAsync(...args: unknown[]) {
      return mockDownload(...args);
    }
  },
}));

import type { Child } from "@/services/openSubsonic/types";
import type useOfflineStore from "@/stores/offline";
import type { OfflineTrack } from "@/stores/offline";

const makeChild = (id: string): Child => ({
  id,
  isDir: false,
  title: `Track ${id}`,
  suffix: "mp3",
  duration: 180,
  size: 5_000_000,
});

const makeOfflineTrack = (
  id: string,
  source: "user" | "auto",
): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  duration: 180,
  path: `/doc/offline/scope/${id}.mp3`,
  size: 5_000_000,
  downloadedAt: "2026-01-01T00:00:00.000Z",
  source,
});

const downloaded = (id: string) => ({
  exists: true,
  size: 5_000_000,
  uri: `/doc/offline/scope/${id}.mp3`,
  text: async () => "",
  delete: () => {},
});

const idOf = (url: unknown) =>
  String(url).replace("https://server/stream/", "");

// Downloads that land only when the test says so.
function holdDownloads() {
  const release = new Map<string, () => void>();
  const fail = new Map<string, (err: Error) => void>();
  mockDownload.mockImplementation(
    (url: string) =>
      new Promise((resolve, reject) => {
        const id = idOf(url);
        release.set(id, () => resolve(downloaded(id)));
        fail.set(id, reject);
      }),
  );
  return { release, fail };
}

function importService() {
  jest.resetModules();
  const { offlineDownloadService } =
    require("@/services/offline/downloadService") as typeof import("@/services/offline/downloadService");
  const useOffline = (
    require("@/stores/offline") as { default: typeof useOfflineStore }
  ).default;
  let writes = 0;
  useOffline.subscribe(() => {
    writes++;
  });
  return {
    offlineDownloadService,
    useOffline,
    state: () => useOffline.getState(),
    writes: () => writes,
  };
}

// Completions are committed to the store in batches (LANDED_COMMIT_MS).
const commitWindow = () => jest.advanceTimersByTimeAsync(300);

beforeEach(() => {
  jest.useFakeTimers();
  mockDownload.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("downloadTracks", () => {
  it("queues a large collection in a constant number of store writes", () => {
    const { offlineDownloadService, state, writes } = importService();
    holdDownloads();
    const tracks = Array.from({ length: 500 }, (_, i) => makeChild(`t${i}`));

    void offlineDownloadService.downloadTracks(tracks).catch(() => {});

    expect(state().downloadQueue).toHaveLength(500);
    expect(state().downloadProgress.t499?.status).toBe("pending");
    // Queue + progress, then one "downloading" write per started download.
    expect(writes()).toBeLessThanOrEqual(6);
  });

  it("resolves only once every track has landed", async () => {
    const { offlineDownloadService, state } = importService();
    const { release } = holdDownloads();
    let settled = false;

    const done = offlineDownloadService
      .downloadTracks([makeChild("a"), makeChild("b")])
      .then(() => {
        settled = true;
      });
    await jest.advanceTimersByTimeAsync(0);
    release.get("a")?.();
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    release.get("b")?.();
    await commitWindow();
    await done;
    expect(state().isTrackDownloaded("a")).toBe(true);
    expect(state().isTrackDownloaded("b")).toBe(true);
    expect(state().downloadQueue).toHaveLength(0);
  });

  it("rejects when one of the tracks fails", async () => {
    const { offlineDownloadService } = importService();
    const { release, fail } = holdDownloads();

    const done = offlineDownloadService.downloadTracks([
      makeChild("a"),
      makeChild("b"),
    ]);
    const outcome = done.then(
      () => "resolved",
      () => "rejected",
    );
    await jest.advanceTimersByTimeAsync(0);
    release.get("a")?.();
    fail.get("b")?.(new Error("boom"));
    await jest.advanceTimersByTimeAsync(0);

    expect(await outcome).toBe("rejected");
  });

  it("resolves at once for tracks already on disk, promoting auto copies", async () => {
    const { offlineDownloadService, state } = importService();
    state().addDownloadedTracks([
      makeOfflineTrack("a", "auto"),
      makeOfflineTrack("b", "user"),
    ]);

    await offlineDownloadService.downloadTracks([
      makeChild("a"),
      makeChild("b"),
    ]);

    expect(mockDownload).not.toHaveBeenCalled();
    expect(state().getDownloadedTrack("a")?.source).toBe("user");
    expect(state().getDownloadedTrack("b")?.source).toBe("user");
  });

  it("promotes a queued auto download to user-owned", () => {
    const { offlineDownloadService, state } = importService();
    holdDownloads();
    offlineDownloadService.enqueueTracks(
      ["a", "b", "c", "d"].map(makeChild),
      "auto",
    );

    void offlineDownloadService
      .downloadTracks([makeChild("d")])
      .catch(() => {});

    const queued = state().downloadQueue.find((t) => t.id === "d");
    expect(queued?.offlineSource).toBe("user");
    expect(state().downloadQueue).toHaveLength(4);
  });

  it("settles a save that joined a download already in flight", async () => {
    const { offlineDownloadService } = importService();
    const { release } = holdDownloads();
    const first = offlineDownloadService.downloadTracks([makeChild("a")]);
    await jest.advanceTimersByTimeAsync(0);

    const second = offlineDownloadService.downloadTracks([makeChild("a")]);
    release.get("a")?.();
    await commitWindow();

    await expect(Promise.all([first, second])).resolves.toBeDefined();
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it("keeps a promotion made while the auto download was in flight", async () => {
    const { offlineDownloadService, state } = importService();
    const { release } = holdDownloads();
    offlineDownloadService.enqueueTracks([makeChild("a")], "auto");
    await jest.advanceTimersByTimeAsync(0);
    expect(mockDownload).toHaveBeenCalledTimes(1);

    const saved = offlineDownloadService.downloadTracks([makeChild("a")]);
    release.get("a")?.();
    await commitWindow();
    await saved;

    expect(state().getDownloadedTrack("a")?.source).toBe("user");
  });

  it("commits downloads that land together in a single store write", async () => {
    const { offlineDownloadService, state, writes } = importService();
    const { release } = holdDownloads();
    const done = offlineDownloadService.downloadTracks(
      ["a", "b", "c"].map(makeChild),
    );
    await jest.advanceTimersByTimeAsync(0);

    const before = writes();
    for (const id of ["a", "b", "c"]) release.get(id)?.();
    await jest.advanceTimersByTimeAsync(0);
    expect(writes() - before).toBe(0);

    await commitWindow();
    await done;

    expect(writes() - before).toBe(1);
    expect(state().getDownloadedTrack("c")).toBeDefined();
    expect(state().downloadProgress.a).toBeUndefined();
    expect(state().downloadQueue).toHaveLength(0);
  });

  it("never picks a landed download up again before it is committed", async () => {
    const { offlineDownloadService } = importService();
    const { release } = holdDownloads();
    offlineDownloadService.enqueueTracks(
      ["a", "b", "c", "d", "e"].map(makeChild),
      "user",
    );
    await jest.advanceTimersByTimeAsync(0);

    release.get("a")?.();
    await jest.advanceTimersByTimeAsync(0);

    const requested = mockDownload.mock.calls.map(([url]) => idOf(url));
    expect(requested).toEqual(["a", "b", "c", "d"]);
  });

  it("writes no downloading entry over a pending one", async () => {
    const { offlineDownloadService, writes } = importService();
    holdDownloads();
    const before = writes();
    void offlineDownloadService
      .downloadTracks(["a", "b", "c"].map(makeChild))
      .catch(() => {});
    await jest.advanceTimersByTimeAsync(0);

    expect(mockDownload).toHaveBeenCalledTimes(3);
    // The queue and the pending entries, nothing per started download.
    expect(writes() - before).toBe(2);
  });

  it("commits a landed download before a removal looks for it", async () => {
    const { offlineDownloadService, state } = importService();
    const { release } = holdDownloads();
    void offlineDownloadService
      .downloadTracks([makeChild("a")])
      .catch(() => {});
    await jest.advanceTimersByTimeAsync(0);
    release.get("a")?.();
    await jest.advanceTimersByTimeAsync(0);

    const removal = offlineDownloadService.removeDownloadedTracks(["a"]);
    await commitWindow();
    await removal;

    expect(state().isTrackDownloaded("a")).toBe(false);
  });
});

describe("resume", () => {
  it("marks every interrupted download failed in one write", () => {
    const { offlineDownloadService, state, writes } = importService();
    state().setManyDownloadProgress(
      Array.from({ length: 200 }, (_, i) => ({
        trackId: `t${i}`,
        status: "downloading" as const,
        progress: 40,
      })),
    );

    const before = writes();
    offlineDownloadService.resume();

    expect(writes() - before).toBe(1);
    expect(state().downloadProgress.t199?.status).toBe("failed");
  });

  it("drops the progress entries of tracks already on disk in one write", () => {
    const { offlineDownloadService, state, writes } = importService();
    state().addDownloadedTracks(
      Array.from({ length: 200 }, (_, i) => makeOfflineTrack(`d${i}`, "user")),
    );
    state().setManyDownloadProgress([
      ...Array.from({ length: 200 }, (_, i) => ({
        trackId: `d${i}`,
        status: "paused" as const,
        progress: 100,
      })),
      { trackId: "f", status: "failed", progress: 0, error: "boom" },
    ]);

    const before = writes();
    offlineDownloadService.resume();

    expect(writes() - before).toBe(1);
    expect(state().downloadProgress.d0).toBeUndefined();
    expect(state().downloadProgress.d199).toBeUndefined();
    expect(state().downloadProgress.f?.status).toBe("failed");
  });

  it("keeps the progress entry of a downloaded track that is queued again", () => {
    const { offlineDownloadService, state } = importService();
    holdDownloads();
    state().addDownloadedTracks([makeOfflineTrack("a", "user")]);
    state().addToDownloadQueue(makeChild("a"));
    state().setDownloadProgress("a", {
      trackId: "a",
      status: "pending",
      progress: 0,
    });

    offlineDownloadService.resume();

    expect(state().downloadProgress.a).toBeDefined();
  });
});
