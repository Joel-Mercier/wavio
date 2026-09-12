// `.ignore` / `.ndignore` / `.nomedia` in the scanner's walk. The convention is
// filesystem-level, not protocol-level — Jellyfin, Navidrome and Android's media
// scanner all implement it against a plain directory tree — so it lives in the
// one walker that device, WebDAV and SMB libraries all share and is exercised
// here through the same scriptable file source the prune-guard tests use.
//
// Two properties matter beyond "the right files get skipped": an ignore file we
// can't read must never be guessed at, and a folder that becomes hidden must
// leave the index the same way a deleted one does.

const mockRun = jest.fn();
const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: (...args: unknown[]) => {
    mockRun(...args);
    return Promise.resolve();
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

/** uris the scan wrote a track row for. */
const indexedUris = (): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT OR REPLACE INTO tracks"))
    .map(([, row]) => String((row as { $uri: string }).$uri));

const deletedIds = (): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).startsWith("DELETE FROM tracks WHERE id"))
    .map(([, id]) => String(id));

/** Declare a directory's children. */
const dir = (
  path: string,
  children: { name: string; isDirectory: boolean }[],
) => mockSource.tree.set(path, children);

const file = (name: string) => ({ name, isDirectory: false });
const folder = (name: string) => ({ name, isDirectory: true });

beforeEach(() => {
  mockRun.mockClear();
  opened.length = 0;
  mockSource.tree = new Map();
  mockSource.files = new Map();
  mockSource.fail = new Set();
  mockSource.readFails = new Set();
  mockDb.getAllAsync.mockResolvedValue([]);
});

describe("ignore files — whole-directory markers", () => {
  it.each([".ignore", ".ndignore"])(
    "an empty %s hides the directory and its subtree",
    async (name) => {
      dir("webdav:/music", [folder("hidden"), file("keep.mp3")]);
      dir("webdav:/music/hidden", [file("a.mp3"), folder("deeper")]);
      dir("webdav:/music/hidden/deeper", [file("b.mp3")]);
      mockSource.tree.get("webdav:/music/hidden")?.push(file(name));
      mockSource.files.set(`webdav:/music/hidden/${name}`, "");

      const result = await scanLibrary(["webdav:/music"], { enrich: false });

      expect(indexedUris()).toEqual(["webdav:/music/keep.mp3"]);
      expect(result.ignoredDirectories).toBe(1);
      expect(result.incomplete).toBe(false);
    },
  );

  it("treats a whitespace-only ignore file as an empty marker", async () => {
    dir("webdav:/music", [folder("hidden")]);
    dir("webdav:/music/hidden", [file(".ignore"), file("a.mp3")]);
    mockSource.files.set("webdav:/music/hidden/.ignore", "\n  \r\n\t");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual([]);
  });

  it("hides a subtree on .nomedia without ever reading it", async () => {
    dir("webdav:/music", [folder("ringtones"), file("keep.mp3")]);
    dir("webdav:/music/ringtones", [file(".nomedia"), file("a.mp3")]);
    // Contents are irrelevant by spec, and a pattern file alongside it loses.
    mockSource.files.set("webdav:/music/ringtones/.nomedia", "!a.mp3");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/keep.mp3"]);
    expect(opened).toEqual([]);
  });

  it("lets .nomedia win over a pattern file in the same directory", async () => {
    dir("webdav:/music", [folder("mixed")]);
    dir("webdav:/music/mixed", [
      file(".ignore"),
      file(".nomedia"),
      file("a.mp3"),
    ]);
    mockSource.files.set("webdav:/music/mixed/.ignore", "*.wav");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual([]);
  });

  // No source specifies its listing order — PROPFIND, an SMB directory query
  // and Directory.list() each answer in their own — so the winner between two
  // pattern files has to come from the filenames, not from arrival order.
  it("picks the same pattern file whatever order the listing returns", async () => {
    dir("webdav:/music", [folder("a"), folder("b")]);
    dir("webdav:/music/a", [
      file(".ignore"),
      file(".ndignore"),
      file("x.mp3"),
      file("y.mp3"),
    ]);
    dir("webdav:/music/b", [
      file(".ndignore"),
      file(".ignore"),
      file("x.mp3"),
      file("y.mp3"),
    ]);
    for (const d of ["a", "b"]) {
      mockSource.files.set(`webdav:/music/${d}/.ignore`, "x.mp3\n");
      mockSource.files.set(`webdav:/music/${d}/.ndignore`, "y.mp3\n");
    }

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris().sort()).toEqual([
      "webdav:/music/a/y.mp3",
      "webdav:/music/b/y.mp3",
    ]);
  });

  it("leaves a directory with no ignore file alone", async () => {
    dir("webdav:/music", [file("a.mp3"), file("b.flac")]);

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris().sort()).toEqual([
      "webdav:/music/a.mp3",
      "webdav:/music/b.flac",
    ]);
    expect(result.ignoredDirectories).toBe(0);
    expect(opened).toEqual([]);
  });
});

describe("ignore files — gitignore patterns", () => {
  it("excludes only the files a pattern matches", async () => {
    dir("webdav:/music", [file(".ignore"), file("a.wav"), file("b.mp3")]);
    mockSource.files.set("webdav:/music/.ignore", "# drop the raws\n*.wav\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/b.mp3"]);
  });

  it("excludes a subdirectory named with a trailing slash", async () => {
    dir("webdav:/music", [
      file(".ignore"),
      folder("samples"),
      folder("albums"),
    ]);
    dir("webdav:/music/samples", [file("s.mp3")]);
    dir("webdav:/music/albums", [file("a.mp3")]);
    mockSource.files.set("webdav:/music/.ignore", "samples/\n");

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/albums/a.mp3"]);
    expect(result.ignoredDirectories).toBe(1);
  });

  // A bare directory name matches at any depth, which is the point of putting a
  // single `@eaDir/` or `samples/` line at the top of a share.
  it("matches a bare directory name at any depth", async () => {
    dir("webdav:/music", [file(".ignore"), folder("artist")]);
    dir("webdav:/music/artist", [folder("@eaDir"), file("a.mp3")]);
    dir("webdav:/music/artist/@eaDir", [file("thumb.mp3")]);
    mockSource.files.set("webdav:/music/.ignore", "@eaDir/\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/artist/a.mp3"]);
  });

  it("cascades a parent's patterns into grandchildren", async () => {
    dir("webdav:/music", [file(".ignore"), folder("artist")]);
    dir("webdav:/music/artist", [folder("album")]);
    dir("webdav:/music/artist/album", [file("a.wav"), file("b.mp3")]);
    mockSource.files.set("webdav:/music/.ignore", "*.wav\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/artist/album/b.mp3"]);
  });

  it("anchors a leading-slash pattern to the declaring directory", async () => {
    dir("webdav:/music", [file(".ignore"), folder("live"), folder("studio")]);
    dir("webdav:/music/live", [file("a.mp3"), folder("live")]);
    dir("webdav:/music/live/live", [file("b.mp3")]);
    dir("webdav:/music/studio", [file("c.mp3")]);
    mockSource.files.set("webdav:/music/.ignore", "/live/**/*.mp3\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/studio/c.mp3"]);
  });

  it("honours a negation that re-includes one file", async () => {
    dir("webdav:/music", [file(".ignore"), file("a.wav"), file("keep.wav")]);
    mockSource.files.set("webdav:/music/.ignore", "*.wav\n!keep.wav\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/keep.wav"]);
  });

  // git resolves a conflict between two ignore files by letting the nearer one
  // win, which is the only way a negation can ever re-include something an
  // ancestor hid. OR-ing the scopes together would make this file unreachable.
  it("lets a nested negation re-include what a parent hid", async () => {
    dir("webdav:/music", [file(".ignore"), folder("stems")]);
    dir("webdav:/music/stems", [
      file(".ignore"),
      file("keep.wav"),
      file("drop.wav"),
    ]);
    mockSource.files.set("webdav:/music/.ignore", "*.wav\n");
    mockSource.files.set("webdav:/music/stems/.ignore", "!keep.wav\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/stems/keep.wav"]);
  });

  it("scopes a nested ignore file to its own directory", async () => {
    dir("webdav:/music", [folder("a"), folder("b")]);
    dir("webdav:/music/a", [file(".ignore"), file("x.mp3")]);
    dir("webdav:/music/b", [file("x.mp3")]);
    // Written relative to `a`, so `b`'s identically-named file is untouched.
    mockSource.files.set("webdav:/music/a/.ignore", "x.mp3\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(["webdav:/music/b/x.mp3"]);
  });
});

describe("ignore files — failure handling", () => {
  // The dangerous case: the file is there, so we know the user meant to hide
  // something, but we can't tell what. Indexing anyway would surface a folder
  // they hid; pruning would delete it for good.
  it("treats an unreadable ignore file as an unreadable directory", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { id: "track-1", uri: "webdav:/music/hidden/a.mp3", mtime: 1, size: 10 },
    ]);
    dir("webdav:/music", [folder("hidden")]);
    dir("webdav:/music/hidden", [file(".ignore"), file("a.mp3")]);
    mockSource.readFails.add("webdav:/music/hidden/.ignore");

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.unreadable).toBe(1);
    expect(result.incomplete).toBe(true);
    expect(result.removed).toBe(0);
    expect(indexedUris()).toEqual([]);
    expect(deletedIds()).toEqual([]);
  });

  // Hiding a folder is asking for it to leave the library, so once the rest of
  // the walk completed the prune is the correct outcome — not the accident the
  // guard above exists to prevent.
  it("prunes tracks in a folder that has become hidden", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { id: "track-1", uri: "webdav:/music/hidden/a.mp3", mtime: 1, size: 10 },
    ]);
    dir("webdav:/music", [folder("hidden")]);
    dir("webdav:/music/hidden", [file(".ignore"), file("a.mp3")]);
    mockSource.files.set("webdav:/music/hidden/.ignore", "");

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(false);
    expect(result.removed).toBe(1);
    expect(deletedIds()).toEqual(["track-1"]);
  });
});
