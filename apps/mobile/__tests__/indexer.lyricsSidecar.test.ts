// Sidecar lyrics in the scanner's walk: the `.lrc` / `.ttml` beside a track is
// matched off the listing the walk already holds, and only its URI is indexed.
// A skipped (unchanged) track must still pick up a sidecar added or removed next
// to it, the same way it picks up its directory.

const mockRun = jest.fn();
const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: (...args: unknown[]) => {
    mockRun(...args);
    return Promise.resolve({ changes: 0, lastInsertRowId: 0 });
  },
  withTransactionAsync: (fn: () => Promise<void>) => fn(),
};

jest.mock("@/services/local/db", () => ({
  getLocalLibraryDb: () => Promise.resolve(mockDb),
  libraryScope: () => "scope",
}));

jest.mock("@/services/local/tagOverrides", () => ({
  reapplyOverridesAfterIndexing: () => Promise.resolve(),
}));

jest.mock("@/services/local/artworkRefs", () => ({
  persistedArtworkNames: () => new Set<string>(),
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
  FileMode: { ReadOnly: "r" },
  File: class {
    exists = false;
    delete() {}
  },
  Directory: class {
    exists = true;
    uri = "file:///doc/local-artwork/scope";
    create() {}
    list() {
      return [];
    }
  },
}));

const mockFsError = (code: string) => Object.assign(new Error(code), { code });

const opened: string[] = [];

// Same shape as the prune-guard stand-in, plus the two things ignore files need:
// file *contents* (`files`) and a way to make one unreadable (`readFails`).
const mockSource = {
  kind: "webdav" as const,
  extractConcurrency: 4,
  listConcurrency: 4,
  tree: new Map<string, { name: string; isDirectory: boolean }[]>(),
  files: new Map<string, string>(),
  fail: new Set<string>(),
  readFails: new Set<string>(),
  normalizeRoot: (root: string) => root,
  exists: () => Promise.resolve(true),
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
  openReader(path: string) {
    opened.push(path);
    if (this.readFails.has(path))
      return Promise.reject(mockFsError("ERR_FS_UNREACHABLE"));
    const contents = this.files.get(path) ?? "";
    return Promise.resolve({
      read: () =>
        Promise.resolve(new TextEncoder().encode(contents) as Uint8Array),
      close() {},
    });
  },
  playableUrl: (path: string) => path,
  probe: () => Promise.resolve(true),
};

jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => mockSource,
}));

import { scanLibrary } from "@/services/local/indexer";

const inserted = (): Record<string, unknown>[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT OR REPLACE INTO tracks"))
    .map(([, row]) => row as Record<string, unknown>);

const sidecarUpdates = (): unknown[][] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes("SET dir = ?, lyrics_sidecar = ?"))
    .map(([, ...params]) => params);

const dir = (path: string, names: string[]) =>
  mockSource.tree.set(
    path,
    names.map((name) => ({ name, isDirectory: false })),
  );

const existing = (rows: Record<string, unknown>[]) =>
  mockDb.getAllAsync.mockImplementation((sql: string) =>
    Promise.resolve(
      String(sql).includes("lyrics_sidecar FROM tracks") ? rows : [],
    ),
  );

beforeEach(() => {
  mockRun.mockClear();
  opened.length = 0;
  mockSource.tree = new Map();
  mockSource.files = new Map();
  mockSource.fail = new Set();
  mockSource.readFails = new Set();
  mockDb.getAllAsync.mockResolvedValue([]);
});

describe("lyrics sidecars", () => {
  it("records the richest matching sidecar without reading it", async () => {
    dir("webdav:/music", [
      "Song.lrc",
      "Song.TTML",
      "Song.mp3",
      "Other.mp3",
      "Other.mp3.lrc",
      "Lonely.flac",
    ]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    const byUri = Object.fromEntries(
      inserted().map((row) => [row.$uri, row.$lyrics_sidecar]),
    );
    expect(byUri).toEqual({
      "webdav:/music/Song.mp3": "webdav:/music/Song.TTML",
      "webdav:/music/Other.mp3": "webdav:/music/Other.mp3.lrc",
      "webdav:/music/Lonely.flac": null,
    });
    expect(opened).toEqual([]);
  });

  it("ignores a sidecar hidden by an ignore rule", async () => {
    dir("webdav:/music", [".ignore", "Song.lrc", "Song.mp3"]);
    mockSource.files.set("webdav:/music/.ignore", "*.lrc");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(inserted()[0]?.$lyrics_sidecar).toBeNull();
  });

  it("backfills a sidecar added beside an unchanged track", async () => {
    dir("webdav:/music", ["Song.mp3", "Song.lrc"]);
    existing([
      {
        id: "t1",
        uri: "webdav:/music/Song.mp3",
        fts_rowid: 1,
        mtime: 1,
        size: 10,
        dir: "webdav:/music",
        lyrics_sidecar: null,
      },
    ]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(inserted()).toEqual([]);
    expect(sidecarUpdates()).toEqual([
      ["webdav:/music", "webdav:/music/Song.lrc", "t1"],
    ]);
  });

  it("clears a sidecar removed beside an unchanged track", async () => {
    dir("webdav:/music", ["Song.mp3"]);
    existing([
      {
        id: "t1",
        uri: "webdav:/music/Song.mp3",
        fts_rowid: 1,
        mtime: 1,
        size: 10,
        dir: "webdav:/music",
        lyrics_sidecar: "webdav:/music/Song.lrc",
      },
    ]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(sidecarUpdates()).toEqual([["webdav:/music", null, "t1"]]);
  });

  it("leaves an unchanged track with an unchanged sidecar alone", async () => {
    dir("webdav:/music", ["Song.mp3", "Song.lrc"]);
    existing([
      {
        id: "t1",
        uri: "webdav:/music/Song.mp3",
        fts_rowid: 1,
        mtime: 1,
        size: 10,
        dir: "webdav:/music",
        lyrics_sidecar: "webdav:/music/Song.lrc",
      },
    ]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(sidecarUpdates()).toEqual([]);
  });
});
