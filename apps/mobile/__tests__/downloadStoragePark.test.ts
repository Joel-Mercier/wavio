// A full device is the one download failure that says nothing about the track
// being downloaded, so the queue parks instead of failing every remaining item
// against a disk that can't take them. The park is only useful if it both ends
// on its own (nothing else wakes a queue whose connectivity never changed) and
// survives a download that was already in flight when it was set.
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

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));
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

const makeChild = (id: string): Child => ({
  id,
  isDir: false,
  title: `Track ${id}`,
  suffix: "mp3",
  duration: 180,
  size: 5_000_000,
});

// No real audio file is under SUSPICIOUS_DOWNLOAD_BYTES, so a size above it
// keeps the service from sniffing the body for a Subsonic error envelope.
const downloaded = (id: string) => ({
  exists: true,
  size: 5_000_000,
  uri: `/doc/offline/scope/${id}.mp3`,
  text: async () => "",
  delete: () => {},
});

const diskFull = () =>
  new Error(
    "Call to function 'FileSystem.downloadFileAsync' has been rejected.\n→ Caused by: java.io.IOException: write failed: ENOSPC (No space left on device)",
  );

const requestedIds = () =>
  mockDownload.mock.calls.map((call) =>
    String(call[0]).replace("https://server/stream/", ""),
  );

// The service is a singleton holding the park window and its timer, so each test
// needs a fresh module — which means a fresh offline store too, since the
// service resolves its own copy out of the reset registry.
function importService() {
  jest.resetModules();
  const { offlineDownloadService } =
    require("@/services/offline/downloadService") as typeof import("@/services/offline/downloadService");
  const useOffline = (
    require("@/stores/offline") as { default: typeof useOfflineStore }
  ).default;
  return { offlineDownloadService, state: () => useOffline.getState() };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockDownload.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("download queue under a full disk", () => {
  it("parks the queue rather than failing every remaining track", async () => {
    const { offlineDownloadService, state } = importService();
    mockDownload.mockRejectedValue(diskFull());

    offlineDownloadService.enqueueTracks(
      [makeChild("a"), makeChild("b"), makeChild("c"), makeChild("d")],
      "user",
    );
    await jest.advanceTimersByTimeAsync(0);

    const progress = state().downloadProgress;
    expect(progress.d?.status).toBe("paused");
    expect(state().downloadQueue).toHaveLength(4);
    expect(Object.values(progress).some((p) => p?.status === "failed")).toBe(
      false,
    );
  });

  it("drains again once the park window elapses, with no other signal", async () => {
    const { offlineDownloadService, state } = importService();
    mockDownload.mockRejectedValue(diskFull());

    offlineDownloadService.enqueueTracks([makeChild("a")], "user");
    await jest.advanceTimersByTimeAsync(0);
    expect(requestedIds()).toEqual(["a"]);

    mockDownload.mockReset();
    mockDownload.mockImplementation(async (url: string) =>
      downloaded(String(url).replace("https://server/stream/", "")),
    );

    // Nothing about connectivity changed — only time passed.
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000 + 1);

    expect(requestedIds()).toEqual(["a"]);
    expect(state().isTrackDownloaded("a")).toBe(true);
  });

  it("keeps the park when a download that started before it succeeds", async () => {
    const { offlineDownloadService, state } = importService();
    let releaseSmall: (value: unknown) => void = () => {};
    mockDownload.mockImplementation(async (url: string) => {
      const id = String(url).replace("https://server/stream/", "");
      if (id === "big") throw diskFull();
      if (id === "small") {
        await new Promise((resolve) => {
          releaseSmall = resolve;
        });
      }
      return downloaded(id);
    });

    offlineDownloadService.enqueueTracks(
      [makeChild("big"), makeChild("small"), makeChild("c"), makeChild("d")],
      "user",
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(requestedIds()).toEqual(["big", "small", "c"]);

    // "small" was already writing when the disk filled up: it squeezing onto an
    // almost-full disk is no evidence there is room for "d".
    releaseSmall(undefined);
    await jest.advanceTimersByTimeAsync(0);

    expect(requestedIds()).not.toContain("d");
    expect(state().downloadProgress.d?.status).toBe("paused");
  });
});
