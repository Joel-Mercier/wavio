// What `cacheTrack` is allowed to register (issue #163). Both cases here are
// silent when they go wrong: a bad entry doesn't fail loudly, it just makes the
// drain fetch the same bytes again on every pass.

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
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
  currentAuthScope: () => "scope",
}));

const mockDownload = {
  size: 5 * 1024 * 1024,
  body: "ID3 audio bytes",
  gate: Promise.resolve() as Promise<void>,
};

// Directories that exist on "disk", so the reconcile sweep has something to walk.
const mockDirs: { uri: string }[] = [];
const mockDeleted: string[] = [];

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    toString() {
      return this.uri;
    }
    get exists() {
      return true;
    }
    get name() {
      return this.uri.split("/").pop() ?? "";
    }
    create() {
      mockDirs.push(this);
    }
    list() {
      return mockDirs;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    get exists() {
      return true;
    }
    get size() {
      return mockDownload.size;
    }
    delete() {}
    static async downloadFileAsync(_url: string, dir: { uri: string }) {
      await mockDownload.gate;
      return {
        uri: `${dir.uri}/track.mp3`,
        exists: true,
        size: mockDownload.size,
        text: async () => mockDownload.body,
        delete: () => {},
      };
    }
  },
}));

jest.mock("@/services/backend/streaming", () => ({
  cacheFetchUrl: () => "https://server/rest/stream?id=t1",
  cacheEstimatedBytes: () => 0,
}));

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => ({ isTrackDownloaded: () => false }) },
}));

import { Directory } from "expo-file-system";
import {
  cacheTrack,
  clearTrackCache,
  reconcileTrackCache,
} from "@/services/trackCache";
import useTrackCache from "@/stores/trackCache";

const track = { id: "t1", suffix: "mp3", duration: 200, bitRate: 320 };

beforeEach(() => {
  useTrackCache.getState().clearEntries();
  mockDirs.length = 0;
  mockDeleted.length = 0;
  mockDownload.size = 5 * 1024 * 1024;
  mockDownload.body = "ID3 audio bytes";
  mockDownload.gate = Promise.resolve();
});

describe("cacheTrack", () => {
  test("registers a real download", async () => {
    await expect(cacheTrack(track)).resolves.toBe(true);
    expect(useTrackCache.getState().getEntry("t1")?.bytes).toBe(
      5 * 1024 * 1024,
    );
  });

  test("rejects an empty body instead of counting it as a success", async () => {
    // A 0-byte file sniffs as neither JSON nor HTML, so nothing else catches it —
    // and cachedTrackUri drops a zero-byte entry on sight, so recording one would
    // put the drain in an unbounded re-download loop with its failure counter
    // reset on every pass.
    mockDownload.size = 0;
    mockDownload.body = "";
    await expect(cacheTrack(track)).resolves.toBe(false);
    expect(useTrackCache.getState().getEntry("t1")).toBeNull();
  });

  test("rejects an error envelope saved under an audio name", async () => {
    mockDownload.size = 120;
    mockDownload.body = '{"subsonic-response":{"status":"failed"}}';
    await expect(cacheTrack(track)).resolves.toBe(false);
    expect(useTrackCache.getState().getEntry("t1")).toBeNull();
  });

  test("a download that outlives clearTrackCache does not repopulate the index", async () => {
    let release!: () => void;
    mockDownload.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = cacheTrack(track);
    clearTrackCache();
    release();

    await expect(pending).resolves.toBe(false);
    expect(useTrackCache.getState().getEntriesList()).toEqual([]);
    expect(useTrackCache.getState().totalBytes).toBe(0);
  });
});

describe("reconcileTrackCache", () => {
  test("leaves an in-flight download's directory alone", async () => {
    // It has no index entry yet, so it looks exactly like the leftovers of an
    // interrupted write — and a same-scope re-login runs the sweep while the
    // prefetcher is mid-download.
    let release!: () => void;
    mockDownload.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = cacheTrack(track);
    mockDeleted.length = 0;
    reconcileTrackCache();
    expect(mockDeleted).toEqual([]);

    release();
    await expect(pending).resolves.toBe(true);
    expect(useTrackCache.getState().getEntry("t1")).not.toBeNull();
  });

  test("still sweeps a directory that belongs to nothing", () => {
    // The other half of the same interruption: bytes on disk the index never
    // learned about, with no download running to claim them.
    new Directory("file:///cache/track-cache/scope", "orphan").create();
    reconcileTrackCache();
    expect(mockDeleted).toEqual(["file:///cache/track-cache/scope/orphan"]);
  });
});
