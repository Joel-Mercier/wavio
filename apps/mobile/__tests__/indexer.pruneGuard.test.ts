// The scan's prune step deletes every indexed track the walk didn't see. That is
// correct only when the walk actually saw the whole library — otherwise it
// mistakes "I couldn't reach this folder" for "the user deleted these files" and
// removes the rows, their FTS shadow entries and their tag overrides, which are
// not recoverable.
//
// On the on-device library the distinction barely existed: a directory that
// doesn't list is genuinely gone. On a WebDAV/SMB share a dropped link, a
// sleeping NAS or an expired credential all produce the same empty listing, so
// the guard is what stands between a Wi-Fi blip and a wiped library.

const mockRun = jest.fn();
const mockDb = {
  getAllAsync: jest.fn(),
  runAsync: (...args: unknown[]) => {
    mockRun(...args);
    return Promise.resolve();
  },
  withTransactionAsync: (fn: () => Promise<void>) => fn(),
};

jest.mock("@/services/local/db", () => ({
  getLocalLibraryDb: () => Promise.resolve(mockDb),
}));

jest.mock("@/services/local/tagOverrides", () => ({
  reapplyOverridesAfterIndexing: () => Promise.resolve(),
}));

jest.mock("@/modules/audio-metadata", () => ({
  getAudioMetadata: () => Promise.resolve({ title: "t" }),
}));

jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
  reportBreadcrumb: jest.fn(),
}));

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => undefined,
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///doc" },
  Directory: class {
    exists = true;
    uri = "file:///doc/local-artwork";
    create() {}
  },
}));

// A scriptable stand-in for the active file source. `fail` marks paths whose
// listing throws, which is the whole point of these tests.
const mockSource = {
  kind: "webdav" as const,
  extractConcurrency: 4,
  tree: new Map<string, { name: string; isDirectory: boolean }[]>(),
  fail: new Set<string>(),
  rootThrows: false,
  normalizeRoot: (root: string) => root,
  exists(_path: string) {
    if (this.rootThrows)
      return Promise.reject(mockFsError("ERR_FS_UNREACHABLE"));
    return Promise.resolve(true);
  },
  list(path: string) {
    if (this.fail.has(path))
      return Promise.reject(mockFsError("ERR_FS_UNREACHABLE"));
    return Promise.resolve(
      (this.tree.get(path) ?? []).map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory,
        size: 10,
        mtime: 1,
        path: `${path}/${e.name}`,
      })),
    );
  },
  openReader: () =>
    Promise.resolve({
      read: () => Promise.resolve(new Uint8Array()),
      close() {},
    }),
  playableUrl: (path: string) => path,
  probe: () => Promise.resolve(true),
};

jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => mockSource,
}));

const mockFsError = (code: string) => Object.assign(new Error(code), { code });

import { scanLibrary } from "@/services/local/indexer";

/** ids the scan issued a DELETE for. */
const deletedIds = (): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).startsWith("DELETE FROM tracks WHERE id"))
    .map(([, id]) => String(id));

beforeEach(() => {
  mockRun.mockClear();
  mockSource.tree = new Map();
  mockSource.fail = new Set();
  mockSource.rootThrows = false;
  // One track already in the index, whose file lives under /music.
  mockDb.getAllAsync.mockResolvedValue([
    { id: "track-1", uri: "webdav:/music/a.flac", mtime: 1, size: 10 },
  ]);
});

describe("scanLibrary prune guard", () => {
  it("prunes a track whose file is gone when the walk completed", async () => {
    mockSource.tree.set("webdav:/music", []); // listed fine, and it's empty now

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(false);
    expect(result.removed).toBe(1);
    expect(deletedIds()).toContain("track-1");
  });

  it("keeps the index intact when a directory fails to list", async () => {
    mockSource.fail.add("webdav:/music");

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(true);
    expect(result.unreadable).toBe(1);
    expect(result.removed).toBe(0);
    expect(deletedIds()).toEqual([]);
  });

  it("keeps the index intact when the root itself is unreachable", async () => {
    mockSource.rootThrows = true;

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(true);
    expect(result.removed).toBe(0);
    expect(deletedIds()).toEqual([]);
  });

  // The partial case is the dangerous one: enough of the tree lists that the
  // scan looks like it worked, while the branch holding the indexed track
  // silently failed.
  it("keeps the index intact when only a subdirectory fails", async () => {
    mockSource.tree.set("webdav:/music", [{ name: "sub", isDirectory: true }]);
    mockSource.fail.add("webdav:/music/sub");

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(true);
    expect(result.removed).toBe(0);
    expect(deletedIds()).toEqual([]);
  });

  it("never deletes tag overrides on an incomplete scan", async () => {
    mockSource.fail.add("webdav:/music");

    await scanLibrary(["webdav:/music"], { enrich: false });

    const overrideDeletes = mockRun.mock.calls.filter(([sql]) =>
      String(sql).includes("track_tag_overrides"),
    );
    expect(overrideDeletes).toEqual([]);
  });

  it("still reports a cancelled scan as not pruning", async () => {
    mockSource.tree.set("webdav:/music", []);
    const controller = { cancelled: true, cancel() {} };

    const result = await scanLibrary(["webdav:/music"], {
      enrich: false,
      controller,
    });

    expect(result.cancelled).toBe(true);
    expect(deletedIds()).toEqual([]);
  });
});
