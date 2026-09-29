// A collection's membership can shrink while its tracks are still downloading:
// a smart playlist redrawn server-side, or the user tapping "update downloads"
// mid-save. Deleting the files isn't enough — a track still sitting in the
// queue has nothing on disk to delete, so unless it leaves the queue too it
// finishes downloading afterwards and lands with no collection referencing it.

const mockReferencedElsewhere = { ids: new Set<string>() };
const mockScope = { value: "scope" };
const mockDeleted: string[] = [];
const mockEvents: string[] = [];

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
    flushPendingScopedWrites: () => mockEvents.push("flush"),
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
  currentAuthScope: () => mockScope.value,
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
jest.mock("@/services/offline", () => ({
  offlineDownloadService: jest.requireActual(
    "@/services/offline/downloadService",
  ).offlineDownloadService,
}));
jest.mock("@/services/offline/collections", () => ({
  trackIdsReferencedByCollections: () => mockReferencedElsewhere.ids,
}));

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: async (uri: string) => {
    if (uri.includes("locked")) throw new Error("EACCES");
    mockDeleted.push(uri);
    mockEvents.push("delete");
  },
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
      delete() {
        if (this.uri.includes("locked")) throw new Error("EACCES");
        mockDeleted.push(this.uri);
      }
    },
  };
});

import * as React from "react";
import TestRenderer from "react-test-renderer";
import { useCollectionDownload } from "@/hooks/offline/useCollectionDownload";
import * as downloadDestination from "@/services/offline/downloadDestination";
import { offlineDownloadService } from "@/services/offline/downloadService";
import type { Child } from "@/services/openSubsonic/types";
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
  mockScope.value = "scope";
  mockDeleted.length = 0;
  mockEvents.length = 0;
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
  it("drops the dropped tracks from the download queue, not just from disk", async () => {
    await offlineDownloadService.removeTracksNotReferencedElsewhere("c1", [
      "onDisk",
      "queued",
    ]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["kept"]);
    expect(state.downloadProgress.queued).toBeUndefined();
    expect(state.downloadedTracks.onDisk).toBeUndefined();
  });

  it("leaves a queued track another collection still references alone", async () => {
    mockReferencedElsewhere.ids = new Set(["queued"]);

    await offlineDownloadService.removeTracksNotReferencedElsewhere("c1", [
      "queued",
    ]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["queued", "kept"]);
    expect(state.downloadProgress.queued).toBeDefined();
  });

  it("touches nothing that wasn't dropped", async () => {
    await offlineDownloadService.removeTracksNotReferencedElsewhere("c1", [
      "queued",
    ]);

    const state = useOffline.getState();
    expect(state.downloadQueue.map((t) => t.id)).toEqual(["kept"]);
    expect(state.downloadProgress.kept).toBeDefined();
    expect(state.downloadedTracks.onDisk).toBeDefined();
  });
});

const seed = (ids: string[], extra: Partial<OfflineTrack> = {}) => {
  const downloadedTracks: Record<string, OfflineTrack> = {};
  for (const id of ids) downloadedTracks[id] = { ...downloaded(id), ...extra };
  useOffline.setState({
    downloadedTracks,
    downloadedCollections: {
      c1: {
        id: "c1",
        kind: "playlist",
        name: "Big",
        songCount: ids.length,
        trackIds: ids,
        savedAt: new Date().toISOString(),
      },
    },
    downloadQueue: [],
    downloadProgress: {},
  });
};

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("removeDownloadedTracks", () => {
  it("drops every entry in one write, persisted before any file is deleted", async () => {
    seed(ids(250));
    let writes = 0;
    const unsubscribe = useOffline.subscribe(() => writes++);

    await offlineDownloadService.removeDownloadedTracks(ids(250));
    unsubscribe();

    expect(writes).toBe(1);
    expect(mockEvents[0]).toBe("flush");
    expect(mockDeleted).toHaveLength(250);
    expect(useOffline.getState().downloadedTracks).toEqual({});
  });

  it("drops the progress entries in the same write", async () => {
    seed(["a"]);
    useOffline.setState({
      downloadProgress: {
        a: { trackId: "a", status: "failed", progress: 0 },
      },
    });

    await offlineDownloadService.removeDownloadedTracks(["a"]);

    expect(useOffline.getState().downloadProgress).toEqual({});
  });

  it("restores the entry of a track whose file could not be deleted", async () => {
    seed(["a", "locked"]);

    await offlineDownloadService.removeDownloadedTracks(["a", "locked"]);

    expect(Object.keys(useOffline.getState().downloadedTracks)).toEqual([
      "locked",
    ]);
  });

  it("finishes the deletes after a scope switch without writing to the new scope", async () => {
    seed(["a", "locked"]);
    const unsubscribe = useOffline.subscribe(() => {
      mockScope.value = "other";
    });

    await offlineDownloadService.removeDownloadedTracks(["a", "locked"]);
    unsubscribe();

    expect(mockDeleted).toEqual(["/doc/offline/scope/a.mp3"]);
    expect(useOffline.getState().downloadedTracks).toEqual({});
  });

  it("holds back a download of a track until its file is deleted", async () => {
    seed(["a"]);
    const removal = offlineDownloadService.removeDownloadedTracks(["a"]);
    const internals = offlineDownloadService as unknown as {
      processQueue: () => void;
      activeIds: Set<string>;
    };
    useOffline.setState({ downloadQueue: [queued("a")] });
    internals.processQueue();

    expect(internals.activeIds.has("a")).toBe(false);
    useOffline.setState({ downloadQueue: [] });
    await removal;
  });

  it("doesn't clobber a download completing mid-removal", async () => {
    seed(ids(150));
    const removal = offlineDownloadService.removeDownloadedTracks(ids(150));
    useOffline.getState().completeDownloads([downloaded("fresh")]);
    await removal;

    expect(Object.keys(useOffline.getState().downloadedTracks)).toEqual([
      "fresh",
    ]);
  });

  it("prunes each album folder once on an external location", async () => {
    jest
      .spyOn(downloadDestination, "isExternalDownloadLocation")
      .mockReturnValue(true);
    const prune = jest
      .spyOn(downloadDestination, "pruneEmptyAlbumFolders")
      .mockResolvedValue();
    seed(["a", "b"]);
    useOffline.setState((state) => ({
      downloadedTracks: {
        ...state.downloadedTracks,
        c: { ...downloaded("c"), album: "Other" },
      },
    }));

    await offlineDownloadService.removeDownloadedTracks(["a", "b", "c"]);

    expect(prune).toHaveBeenCalledTimes(2);
    expect(prune).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      "scope",
    );
    jest.restoreAllMocks();
  });
});

describe("removeCollection", () => {
  it("unregisters the collection with its tracks, persisted before any file is deleted", async () => {
    seed(ids(150));
    const removal = offlineDownloadService.removeCollection("c1", ids(150));

    expect(useOffline.getState().downloadedCollections.c1).toBeUndefined();
    expect(useOffline.getState().downloadedTracks).toEqual({});
    expect(offlineDownloadService.isRemovingCollection("c1")).toBe(true);
    expect(mockEvents[0]).toBe("flush");

    await removal;
    expect(offlineDownloadService.isRemovingCollection("c1")).toBe(false);
    expect(mockDeleted).toHaveLength(150);
  });

  it("ignores a second removal of a collection already being removed", async () => {
    seed(ids(150));
    const first = offlineDownloadService.removeCollection("c1", ids(150));
    await offlineDownloadService.removeCollection("c1", ids(150));
    await first;

    expect(mockDeleted).toHaveLength(150);
  });

  it("notifies subscribers when a removal starts and ends", async () => {
    seed(["a"]);
    const listener = jest.fn();
    const unsubscribe =
      offlineDownloadService.subscribeRemovingCollections(listener);

    await offlineDownloadService.removeCollection("c1", ["a"]);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("useCollectionDownload while removing", () => {
  const songs = ids(150).map(
    (id) => ({ id, title: id, isDir: false }) as Child,
  );
  const meta = { id: "c1", kind: "playlist" as const, name: "Big" };

  it("reports isRemoving and refuses a save racing the deletes", async () => {
    seed(ids(150));
    let hook!: ReturnType<typeof useCollectionDownload>;
    function Probe() {
      hook = useCollectionDownload(songs, meta);
      return null;
    }
    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });

    let removal!: Promise<void>;
    TestRenderer.act(() => {
      removal = offlineDownloadService.removeCollection("c1", ids(150));
    });
    expect(hook.isRemoving).toBe(true);

    await TestRenderer.act(() => hook.saveAll());
    expect(useOffline.getState().downloadQueue).toEqual([]);

    await TestRenderer.act(() => removal);
    expect(hook.isRemoving).toBe(false);
    expect(hook.status).toBe("none");
  });
});
