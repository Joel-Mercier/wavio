// The scanner's listing phase runs directories through a bounded pool rather
// than a serial recursion, because on a share every listing is a network round
// trip and the walk used to make them one at a time.
//
// What has to survive that: the *set* of indexed files and the order they're
// written in are the same whatever order the listings happen to resolve in; one
// unreadable folder can't take the pool's other workers with it; ignore scopes
// still cascade to the right children; and Stop still stops.

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

// Same stand-in as the ignore-file and prune-guard suites, instrumented so a
// test can see how many listings were in flight at once and force some of them
// to resolve on a later tick than their siblings.
const mockSource = {
  kind: "webdav" as const,
  extractConcurrency: 4,
  listConcurrency: 4,
  tree: new Map<string, { name: string; isDirectory: boolean }[]>(),
  files: new Map<string, string>(),
  fail: new Set<string>(),
  /** Directories whose listing resolves several ticks late. */
  slow: new Set<string>(),
  calls: [] as string[],
  active: 0,
  peak: 0,
  normalizeRoot: (root: string) => root,
  exists: () => Promise.resolve(true),
  async list(path: string) {
    this.calls.push(path);
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    try {
      const ticks = this.slow.has(path) ? 5 : 1;
      for (let i = 0; i < ticks; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (this.fail.has(path)) throw mockFsError("ERR_FS_UNREACHABLE");
      return (this.tree.get(path) ?? []).map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory,
        size: 10,
        mtime: 1,
        path: `${path}/${e.name}`,
      }));
    } finally {
      this.active--;
    }
  },
  openReader(path: string) {
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

import { createScanController, scanLibrary } from "@/services/local/indexer";

/** uris the scan wrote a track row for, in the order it wrote them. */
const indexedUris = (): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT OR REPLACE INTO tracks"))
    .map(([, row]) => String((row as { $uri: string }).$uri));

const indexedDir = (uri: string): string | undefined =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT OR REPLACE INTO tracks"))
    .map(([, row]) => row as { $uri: string; $dir: string })
    .find((row) => row.$uri === uri)?.$dir;

const deletedIds = (): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).startsWith("DELETE FROM tracks WHERE id"))
    .map(([, id]) => String(id));

const dir = (
  path: string,
  children: { name: string; isDirectory: boolean }[],
) => mockSource.tree.set(path, children);

const file = (name: string) => ({ name, isDirectory: false });
const folder = (name: string) => ({ name, isDirectory: true });

/** `count` sibling album folders under the root, one track in each. */
const siblings = (count: number, root = "webdav:/music"): string[] => {
  const names = Array.from(
    { length: count },
    (_, i) => `album-${String(i).padStart(2, "0")}`,
  );
  dir(root, names.map(folder));
  for (const name of names) dir(`${root}/${name}`, [file("a.mp3")]);
  return names;
};

beforeEach(() => {
  mockRun.mockClear();
  mockSource.tree = new Map();
  mockSource.files = new Map();
  mockSource.fail = new Set();
  mockSource.slow = new Set();
  mockSource.calls = [];
  mockSource.active = 0;
  mockSource.peak = 0;
  mockSource.listConcurrency = 4;
  mockDb.getAllAsync.mockResolvedValue([]);
});

describe("the listing pool", () => {
  it("lists siblings in parallel up to listConcurrency", async () => {
    siblings(12);

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(mockSource.peak).toBe(4);
    expect(result.indexed).toBe(12);
    expect(indexedUris()).toHaveLength(12);
  });

  it("never overlaps two listings for a source that lists synchronously", async () => {
    mockSource.listConcurrency = 1;
    siblings(12);

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(mockSource.peak).toBe(1);
    expect(indexedUris()).toHaveLength(12);
  });

  it("keeps draining when the queue momentarily empties", async () => {
    // A chain has at most one listable directory at a time, so a pool whose
    // workers retired on an empty queue would stall after the first one.
    dir("webdav:/music", [folder("a")]);
    dir("webdav:/music/a", [folder("b"), file("1.mp3")]);
    dir("webdav:/music/a/b", [folder("c"), file("2.mp3")]);
    dir("webdav:/music/a/b/c", [file("3.mp3")]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toHaveLength(3);
  });

  it("doesn't let one unreadable directory abort the pool", async () => {
    siblings(12);
    mockSource.fail.add("webdav:/music/album-05");
    mockDb.getAllAsync.mockResolvedValue([
      { id: "stale", uri: "webdav:/music/gone.mp3", mtime: 1, size: 1 },
    ]);

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toHaveLength(11);
    expect(result.unreadable).toBe(1);
    expect(result.incomplete).toBe(true);
    // The prune guard: a walk that didn't see everything removes nothing.
    expect(deletedIds()).toEqual([]);
  });

  it("indexes the same files in the same order whatever order the listings resolve in", async () => {
    const names = siblings(8);
    for (const name of names.filter((_, i) => i % 2 === 0)) {
      mockSource.slow.add(`webdav:/music/${name}`);
    }

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris()).toEqual(
      names.map((name) => `webdav:/music/${name}/a.mp3`),
    );
  });

  it("stops the walk when the controller is cancelled", async () => {
    siblings(40);
    const controller = createScanController();
    const original = mockSource.list.bind(mockSource);
    mockSource.list = async function patched(path: string) {
      const entries = await original(path);
      if (this.calls.length >= 6) controller.cancel();
      return entries;
    };

    const result = await scanLibrary(["webdav:/music"], {
      enrich: false,
      controller,
    });
    mockSource.list = original;

    expect(result.cancelled).toBe(true);
    // A walk stopped partway never saw the whole library, so it has to say so —
    // that flag is what `maybeAutoScan` resumes from.
    expect(result.incomplete).toBe(true);
    expect(indexedUris()).toEqual([]);
    expect(deletedIds()).toEqual([]);
    // In-flight listings are allowed to finish; no new ones start.
    expect(mockSource.calls.length).toBeLessThanOrEqual(6 + 4);
  });

  it("stops descending past the depth guard", async () => {
    let path = "webdav:/music";
    for (let depth = 0; depth <= 15; depth++) {
      const next = `${path}/d${depth}`;
      dir(path, [folder(`d${depth}`), file(`t${depth}.mp3`)]);
      path = next;
    }
    dir(path, [file("deepest.mp3")]);

    await scanLibrary(["webdav:/music"], { enrich: false });

    // MAX_DEPTH is 12, and the root is depth 0.
    expect(mockSource.calls).toContain(
      "webdav:/music/d0/d1/d2/d3/d4/d5/d6/d7/d8/d9/d10/d11",
    );
    expect(mockSource.calls).not.toContain(
      "webdav:/music/d0/d1/d2/d3/d4/d5/d6/d7/d8/d9/d10/d11/d12",
    );
  });

  it("reports the directory count every 25 folders", async () => {
    siblings(60);
    const seen: number[] = [];

    await scanLibrary(["webdav:/music"], {
      enrich: false,
      onProgress: (p) => {
        if (p.phase === "listing" && p.directories) seen.push(p.directories);
      },
    });

    expect(seen).toEqual([25, 50]);
  });

  it("settles a file two directories report on the directory name, not on timing", async () => {
    // An aliasing source: `dupe.mp3` is listed by both albums under one root.
    const run = async (slow: string | null) => {
      mockRun.mockClear();
      mockSource.slow = new Set(slow ? [slow] : []);
      dir("webdav:/music", [folder("a-album"), folder("z-album")]);
      mockSource.tree.set("webdav:/music/a-album", [file("dupe.mp3")]);
      mockSource.tree.set("webdav:/music/z-album", [file("dupe.mp3")]);
      // Both listings hand back the identical canonical URI.
      const aliased = [
        {
          name: "dupe.mp3",
          isDirectory: false,
          size: 10,
          mtime: 1,
          path: "webdav:/music/shared/dupe.mp3",
        },
      ];
      const original = mockSource.list.bind(mockSource);
      mockSource.list = async function patched(path: string) {
        const entries = await original(path);
        return path === "webdav:/music" ? entries : aliased;
      };
      await scanLibrary(["webdav:/music"], { enrich: false });
      mockSource.list = original;
      return indexedDir("webdav:/music/shared/dupe.mp3");
    };

    expect(await run(null)).toBe("webdav:/music/a-album");
    expect(await run("webdav:/music/a-album")).toBe("webdav:/music/a-album");
  });
});

describe.each([1, 4])("ignore scopes at listConcurrency %i", (limit) => {
  beforeEach(() => {
    mockSource.listConcurrency = limit;
  });

  it("only apply a directory's rules to its own subtree", async () => {
    dir("webdav:/music", [folder("rock"), folder("jazz")]);
    dir("webdav:/music/rock", [
      file(".ignore"),
      file("demo.wav"),
      file("a.mp3"),
    ]);
    dir("webdav:/music/jazz", [file("demo.wav"), file("b.mp3")]);
    mockSource.files.set("webdav:/music/rock/.ignore", "*.wav\n");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris().sort()).toEqual([
      "webdav:/music/jazz/b.mp3",
      "webdav:/music/jazz/demo.wav",
      "webdav:/music/rock/a.mp3",
    ]);
  });

  it("cascade into descendants regardless of which sibling is listed first", async () => {
    dir("webdav:/music", [folder("rock")]);
    dir("webdav:/music/rock", [
      file(".ignore"),
      folder("live"),
      folder("studio"),
    ]);
    dir("webdav:/music/rock/live", [file("demo.wav"), file("a.mp3")]);
    dir("webdav:/music/rock/studio", [file("demo.wav"), file("b.mp3")]);
    mockSource.files.set("webdav:/music/rock/.ignore", "*.wav\n");
    mockSource.slow.add("webdav:/music/rock/live");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(indexedUris().sort()).toEqual([
      "webdav:/music/rock/live/a.mp3",
      "webdav:/music/rock/studio/b.mp3",
    ]);
  });
});
