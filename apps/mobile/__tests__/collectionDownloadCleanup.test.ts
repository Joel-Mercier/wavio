// A collection's membership can shrink while its tracks are still downloading:
// a smart playlist redrawn server-side, or the user tapping "update downloads"
// mid-save. Deleting the files isn't enough — a track still sitting in the
// queue has nothing on disk to delete, so unless it leaves the queue too it
// finishes downloading afterwards and lands with no collection referencing it.

const mockReferencedElsewhere = { ids: new Set<string>() };

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

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({ downloadsWifiOnly: false, downloadLocationUri: null }),
  },
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      url: "https://server",
      username: "n",
      serverId: "s1",
    }),
  },
  currentAuthScope: () => "scope",
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
  offlineFileInfo: (t: { id: string }) => ({ url: `u/${t.id}`, suffix: "mp3" }),
}));
jest.mock("@/services/offline/collections", () => ({
  trackIdsReferencedByCollections: () => mockReferencedElsewhere.ids,
}));

jest.mock("expo-file-system", () => {
  const join = (uris: unknown[]) => uris.map(String).join("/");
  return {
    Paths: { document: "/doc", cache: "/cache" },
    Directory: class {
      uri: string;
      constructor(...uris: unknown[]) {
        this.uri = join(uris);
      }
      exists = true;
      create() {}
      delete() {}
      list() {
        return [];
      }
    },
    File: class {
      uri: string;
      constructor(...uris: unknown[]) {
        this.uri = join(uris);
      }
      exists = true;
      delete() {}
    },
  };
});

import { offlineDownloadService } from "@/services/offline/downloadService";
import useOffline, { type OfflineTrack } from "@/stores/offline";

const downloaded = (id: string): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  path: `/doc/offline/scope/${id}.mp3`,
  size: 1_000,
  duration: 100,
  downloadedAt: new Date().toISOString(),
  artist: "Artist",
  album: "Album",
});

const queued = (id: string) => ({ id, title: `Track ${id}`, isDir: false });

beforeEach(() => {
  mockReferencedElsewhere.ids = new Set<string>();
  useOffline.setState({
    downloadedTracks: { onDisk: downloaded("onDisk") },
    downloadedCollections: {},
    downloadQueue: [queued("queued"), queued("kept")],
    downloadProgress: {
      queued: { trackId: "queued", status: "pending", progress: 0 },
      kept: { trackId: "kept", status: "pending", progress: 0 },
    },
  });
});

describe("removeTracksNotReferencedElsewhere", () => {
  it("drops the dropped tracks from the download queue, not just from disk", () => {
    offlineDownloadService.removeTracksNotReferencedElsewhere("c1", [
      "onDisk",
      "queued",
    ]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["kept"]);
    expect(state.downloadProgress.queued).toBeUndefined();
    expect(state.downloadedTracks.onDisk).toBeUndefined();
  });

  it("leaves a queued track another collection still references alone", () => {
    mockReferencedElsewhere.ids = new Set(["queued"]);

    offlineDownloadService.removeTracksNotReferencedElsewhere("c1", ["queued"]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["queued", "kept"]);
    expect(state.downloadProgress.queued).toBeDefined();
  });

  it("touches nothing that wasn't dropped", () => {
    offlineDownloadService.removeTracksNotReferencedElsewhere("c1", ["queued"]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["kept"]);
    expect(state.downloadProgress.kept).toBeDefined();
    expect(state.downloadedTracks.onDisk).toBeDefined();
  });
});
