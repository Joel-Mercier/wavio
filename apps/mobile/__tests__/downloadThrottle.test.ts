// Navidrome 0.62+ can cap concurrent transcodes and answers the excess with 429.
// That says the server is busy, not that the track is bad, so the queue keeps
// the track, backs off, and stops asking for more at once than it was serving.
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

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
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

jest.mock("expo-file-system", () => ({
  Paths: { document: "/doc" },
  Directory: class {
    exists = true;
    create() {}
    delete() {}
  },
  File: class {
    exists = false;
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

const downloaded = (id: string) => ({
  exists: true,
  size: 5_000_000,
  uri: `/doc/offline/scope/${id}.mp3`,
  text: async () => "",
  delete: () => {},
});

// The message each platform's expo-file-system rejects a 429 with.
const tooManyTranscodes = (platform: "android" | "ios" = "android") =>
  new Error(
    platform === "android"
      ? "Call to function 'FileSystem.downloadFileAsync' has been rejected.\n→ Caused by: Unable to download a file: response has status: 429"
      : "Unable to download a file: response has status 429",
  );

const idOf = (url: unknown) =>
  String(url).replace("https://server/stream/", "");

const requestedIds = () => mockDownload.mock.calls.map((call) => idOf(call[0]));

// Models a server that serves at most `slots` downloads at once. Every download
// stays open until `finish` is called for it, so the test controls overlap.
function serverWithSlots(initialSlots: number) {
  let slots = initialSlots;
  let open = 0;
  let refused = 0;
  const pending = new Map<string, () => void>();
  mockDownload.mockImplementation(async (url: string) => {
    const id = idOf(url);
    if (open >= slots) {
      refused++;
      throw tooManyTranscodes();
    }
    open++;
    await new Promise<void>((resolve) => pending.set(id, resolve));
    open--;
    return downloaded(id);
  });
  return {
    finish: (id: string) => {
      pending.get(id)?.();
      pending.delete(id);
    },
    inFlight: () => [...pending.keys()],
    refused: () => refused,
    setSlots: (n: number) => {
      slots = n;
    },
  };
}

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
  mockReportError.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("download queue against a transcode cap", () => {
  it.each(["android", "ios"] as const)(
    "keeps a refused track queued and retries it after the server's delay (%s)",
    async (platform) => {
      const { offlineDownloadService, state } = importService();
      mockDownload.mockRejectedValueOnce(tooManyTranscodes(platform));
      mockDownload.mockImplementation(async (url: string) =>
        downloaded(idOf(url)),
      );

      offlineDownloadService.enqueueTracks([makeChild("a")], "user");
      await jest.advanceTimersByTimeAsync(0);

      expect(state().downloadProgress.a?.status).toBe("pending");
      expect(state().downloadQueue).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(4_000);
      expect(requestedIds()).toEqual(["a"]);

      await jest.advanceTimersByTimeAsync(2_000);
      expect(requestedIds()).toEqual(["a", "a"]);
      expect(state().isTrackDownloaded("a")).toBe(true);
      expect(mockReportError).not.toHaveBeenCalled();
    },
  );

  it("never gives up on a track the server keeps refusing", async () => {
    const { offlineDownloadService, state } = importService();
    for (let i = 0; i < 6; i++) {
      mockDownload.mockRejectedValueOnce(tooManyTranscodes());
    }
    mockDownload.mockImplementation(async (url: string) =>
      downloaded(idOf(url)),
    );

    offlineDownloadService.enqueueTracks([makeChild("a")], "user");
    // Six refusals, 5 s apart: past both MAX_TRACK_ATTEMPTS and the circuit
    // breaker's threshold, either of which would have failed or parked it.
    await jest.advanceTimersByTimeAsync(6 * 5_000 + 1_000);

    expect(requestedIds()).toHaveLength(7);
    expect(state().isTrackDownloaded("a")).toBe(true);
    expect(state().downloadProgress.a?.status).not.toBe("failed");
  });

  it("stops asking for more downloads at once than the server serves", async () => {
    const { offlineDownloadService, state } = importService();
    const server = serverWithSlots(2);
    const ids = ["a", "b", "c", "d", "e", "f"];

    offlineDownloadService.enqueueTracks(ids.map(makeChild), "user");
    await jest.advanceTimersByTimeAsync(0);
    expect(requestedIds()).toEqual(["a", "b", "c"]);
    expect(server.inFlight()).toEqual(["a", "b"]);

    // The refusal holds back new starts, and a free slot is what ends the wait.
    await jest.advanceTimersByTimeAsync(6_000);
    expect(requestedIds()).toHaveLength(3);

    while (server.inFlight().length > 0) {
      for (const id of server.inFlight()) server.finish(id);
      await jest.advanceTimersByTimeAsync(0);
    }
    await jest.advanceTimersByTimeAsync(1_000);

    for (const id of ids) expect(state().isTrackDownloaded(id)).toBe(true);
    expect(server.refused()).toBe(1);
    expect(requestedIds()).toHaveLength(ids.length + 1);
  });

  it("goes back up to full concurrency once the server stops refusing", async () => {
    const { offlineDownloadService } = importService();
    const server = serverWithSlots(2);

    offlineDownloadService.enqueueTracks(
      ["a", "b", "c"].map(makeChild),
      "user",
    );
    await jest.advanceTimersByTimeAsync(0);
    server.setSlots(10);
    server.finish("a");
    server.finish("b");
    await jest.advanceTimersByTimeAsync(6_000);
    server.finish("c");
    await jest.advanceTimersByTimeAsync(61_000);

    offlineDownloadService.enqueueTracks(
      ["d", "e", "f", "g"].map(makeChild),
      "user",
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(server.inFlight()).toEqual(["d", "e"]);

    // The first success after a quiet minute restores one slot.
    server.finish("d");
    await jest.advanceTimersByTimeAsync(0);
    expect(server.inFlight()).toEqual(["e", "f", "g"]);
  });
});
