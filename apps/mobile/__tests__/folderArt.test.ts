// Sidecar cover art — the `cover.jpg` / `front.png` / `artist.jpg` beside the
// tracks rather than inside them (issue #157).
//
// Two halves are worth pinning. Which file gets picked is pure ranking, and the
// interesting cases are the ones the conventions disagree on: extensions beyond
// jpg, case, and a numbered sibling. The rest is resolution through the walk —
// that a disc subfolder inherits its album root's cover but two albums under one
// artist folder do not, and that a cover dropped into an otherwise unchanged
// folder is picked up without re-extracting a single file, which is the whole
// reason artwork is keyed by directory instead of mockWritten onto track rows.

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

/** Artwork filenames the queue / recent plays still point at. */
const mockPersistedNames = new Set<string>();

jest.mock("@/services/local/artworkRefs", () => ({
  persistedArtworkNames: () => new Set(mockPersistedNames),
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

/** Files that "exist" on disk, by uri. */
const mockWritten = new Set<string>();
const mockDownloaded: string[] = [];
/** Urls whose transfer fails, for the folder whose mirror can't be made. */
const mockDownloadFails = new Set<string>();
/** What the artwork directory lists, by name — what `pruneArtwork` sees. */
const mockArtworkFiles = new Set<string>();

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name?: string) {
      const base = typeof dir === "string" ? dir : dir.uri;
      this.uri = name ? `${base}/${name}` : base;
      this.name = this.uri.split("/").pop() ?? "";
    }
    get exists() {
      return mockWritten.has(this.uri);
    }
    get size() {
      return 4096;
    }
    get md5() {
      return "deadbeef";
    }
    copy(target: MockFile) {
      mockWritten.add(target.uri);
      return Promise.resolve();
    }
    move(target: MockFile) {
      mockWritten.delete(this.uri);
      mockWritten.add(target.uri);
      return Promise.resolve();
    }
    open() {
      // A JPEG's magic, so `looksLikeImage` is satisfied.
      return {
        readBytes: () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        close() {},
      };
    }
    delete() {
      mockWritten.delete(this.uri);
      mockArtworkFiles.delete(this.name);
    }
    static downloadFileAsync(url: string, target: MockFile) {
      mockDownloaded.push(url);
      if (mockDownloadFails.has(url)) {
        return Promise.reject(new Error("transfer failed"));
      }
      mockWritten.add(target.uri);
      return Promise.resolve(target);
    }
  }
  return {
    Paths: { document: "file:///doc" },
    FileMode: { ReadOnly: "r" },
    File: MockFile,
    Directory: class {
      uri: string;
      exists = true;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = parts
          .map((part) => (typeof part === "string" ? part : part.uri))
          .join("/");
      }
      create() {}
      list() {
        return [...mockArtworkFiles].map((name) => new MockFile(this, name));
      }
    },
  };
});

const listing = (path: string, tree: Map<string, Child[]>) =>
  (tree.get(path) ?? []).map((child) => ({
    name: child.name,
    isDirectory: child.isDirectory,
    size: child.isDirectory ? 0 : 4096,
    mtime: child.isDirectory ? 0 : 1_700_000_000_000,
    path: `${path}/${child.name}`,
  }));

type Child = { name: string; isDirectory: boolean };

const mockSource = {
  kind: "webdav" as const,
  extractConcurrency: 4,
  listConcurrency: 4,
  tree: new Map<string, Child[]>(),
  normalizeRoot: (root: string) => root,
  exists: () => Promise.resolve(true),
  list(path: string) {
    return Promise.resolve(listing(path, this.tree));
  },
  openReader: () =>
    Promise.resolve({
      read: () => Promise.resolve(new Uint8Array()),
      close() {},
    }),
  playableUrl: (path: string) => path.replace("webdav:", "https://nas"),
  probe: () => Promise.resolve(true),
};

const defaultList = mockSource.list;
const defaultOpenReader = mockSource.openReader;

jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => mockSource,
}));

import {
  DEFAULT_ALBUM_ART_NAMES as ALBUM_ART_NAMES,
  DEFAULT_ARTIST_ART_NAMES as ARTIST_ART_NAMES,
} from "@/services/local/artNames";
import {
  folderImageKey,
  imageExtension,
  pickFolderImage,
} from "@/services/local/folderArt";
import { scanLibrary } from "@/services/local/indexer";

const entry = (name: string, isDirectory = false) => ({
  name,
  isDirectory,
  size: 4096,
  mtime: 1,
  path: `webdav:/music/${name}`,
});

const dir = (path: string, children: Child[]) =>
  mockSource.tree.set(path, children);
const file = (name: string) => ({ name, isDirectory: false });
const folder = (name: string) => ({ name, isDirectory: true });

/** Rows the scan wrote into an artwork table, as [key, artworkPath]. */
const artRows = (table: string): [string, string][] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).includes(`INSERT OR REPLACE INTO ${table}`))
    .map(([, key, path]) => [String(key), String(path)]);

const deletedArt = (table: string): string[] =>
  mockRun.mock.calls
    .filter(([sql]) => String(sql).startsWith(`DELETE FROM ${table}`))
    .map(([, key]) => String(key));

const MIRRORED = "file:///doc/local-artwork/scope/folderart-deadbeef.jpg";

beforeEach(() => {
  mockRun.mockClear();
  mockWritten.clear();
  mockDownloaded.length = 0;
  mockDownloadFails.clear();
  mockArtworkFiles.clear();
  mockPersistedNames.clear();
  mockSource.tree = new Map();
  mockSource.list = defaultList;
  mockSource.openReader = defaultOpenReader;
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ n: 1 });
});

describe("pickFolderImage", () => {
  it("is not limited to jpg", () => {
    for (const extension of ["jpg", "jpeg", "png", "webp", "gif"]) {
      expect(imageExtension(`cover.${extension}`)).toBe(extension);
      expect(
        pickFolderImage([entry(`cover.${extension}`)], ALBUM_ART_NAMES)?.name,
      ).toBe(`cover.${extension}`);
    }
  });

  it("ignores an image format neither platform reliably decodes", () => {
    // Admitting it on the strength of its extension would render a blank tile,
    // which is worse than falling through to the embedded picture.
    expect(imageExtension("cover.tiff")).toBeUndefined();
    expect(
      pickFolderImage([entry("cover.tiff")], ALBUM_ART_NAMES),
    ).toBeUndefined();
  });

  it("matches regardless of case", () => {
    expect(pickFolderImage([entry("Folder.JPG")], ALBUM_ART_NAMES)?.name).toBe(
      "Folder.JPG",
    );
  });

  it("follows the name order whatever order the listing arrives in", () => {
    // No listing order is specified: a PROPFIND, an SMB query and
    // Directory.list() each answer in their own.
    const entries = [
      entry("front.png"),
      entry("cover.jpg"),
      entry("folder.jpg"),
    ];
    expect(pickFolderImage(entries, ALBUM_ART_NAMES)?.name).toBe("cover.jpg");
    expect(pickFolderImage([...entries].reverse(), ALBUM_ART_NAMES)?.name).toBe(
      "cover.jpg",
    );
  });

  it("prefers the plain name over a numbered sibling, but takes it alone", () => {
    expect(
      pickFolderImage(
        [entry("cover.1.jpg"), entry("cover.jpg")],
        ALBUM_ART_NAMES,
      )?.name,
    ).toBe("cover.jpg");
    expect(pickFolderImage([entry("cover-2.jpg")], ALBUM_ART_NAMES)?.name).toBe(
      "cover-2.jpg",
    );
  });

  it("never picks an unrelated image", () => {
    const entries = [
      entry("back.jpg"),
      entry("booklet-02.png"),
      entry("me.png"),
    ];
    expect(pickFolderImage(entries, ALBUM_ART_NAMES)).toBeUndefined();
  });

  it("keeps album and artist names apart", () => {
    const entries = [entry("cover.jpg"), entry("artist.jpg")];
    expect(pickFolderImage(entries, ALBUM_ART_NAMES)?.name).toBe("cover.jpg");
    expect(pickFolderImage(entries, ARTIST_ART_NAMES)?.name).toBe("artist.jpg");
  });

  it("skips a directory that happens to be named like a cover", () => {
    expect(
      pickFolderImage([entry("cover.jpg", true)], ALBUM_ART_NAMES),
    ).toBeUndefined();
  });

  it("has no change token when the source reports neither size nor mtime", () => {
    // webdavMultistatus falls back to 0 for a server that omits
    // `getcontentlength`, and "unchanged" must not be inferred from that.
    expect(
      folderImageKey({ ...entry("cover.jpg"), size: 0, mtime: 0 }),
    ).toBeUndefined();
    expect(folderImageKey(entry("cover.jpg"))).toContain("cover.jpg");
  });
});

describe("scanLibrary — sidecar artwork", () => {
  it("records the folder's cover and fetches it once for the whole folder", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [
      file("cover.jpg"),
      file("a.mp3"),
      file("b.mp3"),
    ]);

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.sidecarCovers).toBe(1);
    expect(artRows("folder_art")).toEqual([["webdav:/music/Album", MIRRORED]]);
    // One transfer, not one per track.
    expect(mockDownloaded).toEqual(["https://nas/music/Album/cover.jpg"]);
  });

  // The configured list (services/local/artNames.ts) has to reach the walk, not
  // just `pickFolderImage`: a library tagged for a player with its own
  // convention is the case this exists for.
  it("honours a configured cover filename the defaults would ignore", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("sleeve.jpg"), file("a.mp3")]);

    const ignored = await scanLibrary(["webdav:/music"], { enrich: false });
    expect(ignored.sidecarCovers).toBe(0);

    mockDownloaded.length = 0;
    const picked = await scanLibrary(["webdav:/music"], {
      enrich: false,
      albumArtNames: ["sleeve"],
    });

    expect(picked.sidecarCovers).toBe(1);
    expect(mockDownloaded).toEqual(["https://nas/music/Album/sleeve.jpg"]);
  });

  // Reordering is the whole point of a priority list, and it has to invalidate
  // by itself. The row below is the one the *previous* list wrote, with an
  // intact mirror and a matching token — exactly the state that makes
  // "keeps an unchanged cover without re-fetching it" skip the transfer. A
  // promotion has to beat that, or changing the setting would do nothing until
  // someone forced a full rescan.
  it("re-picks when the configured order promotes another file", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [
      file("cover.jpg"),
      file("front.jpg"),
      file("a.mp3"),
    ]);
    mockWritten.add(MIRRORED);
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("FROM folder_art")
          ? [
              {
                k: "webdav:/music/Album",
                artwork_path: MIRRORED,
                source_key: "webdav:/music/Album/cover.jpg|4096|1700000000000",
              },
            ]
          : [],
      ),
    );

    await scanLibrary(["webdav:/music"], {
      enrich: false,
      albumArtNames: ["front", "cover"],
    });

    expect(mockDownloaded).toEqual(["https://nas/music/Album/front.jpg"]);
  });

  it("picks up a cover added to a folder whose files are all unchanged", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("cover.jpg"), file("a.mp3")]);
    // Already indexed at the same size and mtime, so the scan re-extracts
    // nothing at all — which is exactly the case that used to need a forced
    // full rescan before a new cover showed up.
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("SELECT id, uri, mtime, size, dir")
          ? [
              {
                id: "t1",
                uri: "webdav:/music/Album/a.mp3",
                mtime: 1_700_000_000_000,
                size: 4096,
                dir: "webdav:/music/Album",
              },
            ]
          : [],
      ),
    );

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.indexed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(artRows("folder_art")).toEqual([["webdav:/music/Album", MIRRORED]]);
    // `indexed` and `removed` are both 0 here, so this is the only thing that
    // tells LibraryAutoScanController the screen is now stale — without it the
    // new cover sits in the index until the app is restarted.
    expect(result.artChanged).toBe(1);
  });

  it("lets a disc subfolder inherit the album root's cover", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [
      file("cover.jpg"),
      folder("CD1"),
      folder("CD2"),
    ]);
    dir("webdav:/music/Album/CD1", [file("a.mp3")]);
    dir("webdav:/music/Album/CD2", [file("b.mp3")]);
    // The parent holds one album.
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("resolved_album_key")
          ? [
              { dir: "webdav:/music/Album/CD1", k: "album" },
              { dir: "webdav:/music/Album/CD2", k: "album" },
            ]
          : [],
      ),
    );

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.sidecarCovers).toBe(2);
    expect(
      artRows("folder_art")
        .map(([key]) => key)
        .sort(),
    ).toEqual(["webdav:/music/Album/CD1", "webdav:/music/Album/CD2"]);
    expect(mockDownloaded).toHaveLength(1);
  });

  it("does not serve an artist folder's image as album art", async () => {
    dir("webdav:/music", [folder("Artist")]);
    dir("webdav:/music/Artist", [
      file("folder.jpg"),
      folder("One"),
      folder("Two"),
    ]);
    dir("webdav:/music/Artist/One", [file("a.mp3")]);
    dir("webdav:/music/Artist/Two", [file("b.mp3")]);
    // Two distinct albums under the parent — Navidrome's albumRootParent guard.
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("resolved_album_key")
          ? [
              { dir: "webdav:/music/Artist/One", k: "one" },
              { dir: "webdav:/music/Artist/Two", k: "two" },
            ]
          : [],
      ),
    );

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.sidecarCovers).toBe(0);
    expect(artRows("folder_art")).toEqual([]);
    expect(mockDownloaded).toEqual([]);
  });

  it("resolves artist.jpg to the artists whose tracks sit under it", async () => {
    dir("webdav:/music", [folder("Artist")]);
    dir("webdav:/music/Artist", [file("artist.jpg"), folder("One")]);
    dir("webdav:/music/Artist/One", [file("a.mp3")]);
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("resolved_artist_key")
          ? [{ artist_key: "theartist", dir: "webdav:/music/Artist/One" }]
          : [],
      ),
    );

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(artRows("artist_art")).toEqual([["theartist", MIRRORED]]);
    // The same image is not also claimed as the album's cover.
    expect(artRows("folder_art")).toEqual([]);
  });

  it("clears the row when the cover is removed", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("a.mp3")]);
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("FROM folder_art")
          ? [
              {
                k: "webdav:/music/Album",
                artwork_path: "file:///doc/local-artwork/scope/old.jpg",
                source_key: "webdav:/music/Album/cover.jpg|4096|1",
              },
            ]
          : [],
      ),
    );

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(deletedArt("folder_art")).toEqual(["webdav:/music/Album"]);
  });

  it("keeps the row when the scan couldn't see the whole library", async () => {
    // A folder that failed to list marks the scan incomplete. A cover that was
    // simply never reached must not read as a cover that was deleted — the same
    // reasoning that stops the track prune (see indexer.pruneGuard).
    dir("webdav:/music", [folder("Album"), folder("Gone")]);
    dir("webdav:/music/Album", [file("a.mp3")]);
    mockSource.list = function (path: string) {
      if (path === "webdav:/music/Gone") {
        return Promise.reject(new Error("unreachable"));
      }
      return Promise.resolve(listing(path, this.tree));
    };
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("FROM folder_art")
          ? [
              {
                k: "webdav:/music/Album",
                artwork_path: "file:///doc/local-artwork/scope/old.jpg",
                source_key: "stale",
              },
            ]
          : [],
      ),
    );

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.incomplete).toBe(true);
    expect(deletedArt("folder_art")).toEqual([]);
  });

  it("keeps an unchanged cover without re-fetching it", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("cover.jpg"), file("a.mp3")]);
    mockWritten.add(MIRRORED);
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("FROM folder_art")
          ? [
              {
                k: "webdav:/music/Album",
                artwork_path: MIRRORED,
                source_key: "webdav:/music/Album/cover.jpg|4096|1700000000000",
              },
            ]
          : [],
      ),
    );

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(mockDownloaded).toEqual([]);
    expect(deletedArt("folder_art")).toEqual([]);
    // Nothing was rewritten, so nothing on screen went stale — the counter has
    // to stay at 0 or every scan would invalidate the whole query cache.
    expect(result.artChanged).toBe(0);
  });

  it("drops a row whose mirrored file is gone and can't be remade", async () => {
    // Worse than no row: the view coalesces the folder cover ahead of the
    // track's own embedded picture, so a row pointing at a file that isn't
    // there hides the artwork the tracks already carry.
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("cover.jpg"), file("a.mp3")]);
    mockDownloadFails.add("https://nas/music/Album/cover.jpg");
    mockDb.getAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("FROM folder_art")
          ? [
              {
                k: "webdav:/music/Album",
                artwork_path: "file:///doc/local-artwork/scope/gone.jpg",
                source_key: "webdav:/music/Album/cover.jpg|4096|1700000000000",
              },
            ]
          : [],
      ),
    );

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect(artRows("folder_art")).toEqual([]);
    expect(deletedArt("folder_art")).toEqual(["webdav:/music/Album"]);
  });

  it("inherits the same cover whichever overlapping root is walked first", async () => {
    // `/music` and the disc folder itself are both configured. Reached as a
    // root the disc folder has no parent, and the walk must not let that erase
    // the link the other root gave it.
    const roots = ["webdav:/music/Artist/Album/CD1", "webdav:/music"];
    for (const order of [roots, [...roots].reverse()]) {
      mockRun.mockClear();
      mockWritten.clear();
      mockDownloaded.length = 0;
      mockSource.tree = new Map();
      dir("webdav:/music", [folder("Artist")]);
      dir("webdav:/music/Artist", [folder("Album")]);
      dir("webdav:/music/Artist/Album", [file("cover.jpg"), folder("CD1")]);
      dir("webdav:/music/Artist/Album/CD1", [file("a.mp3")]);
      mockDb.getAllAsync.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes("resolved_album_key")
            ? [{ dir: "webdav:/music/Artist/Album/CD1", k: "album" }]
            : [],
        ),
      );

      await scanLibrary(order, { enrich: false });

      expect(artRows("folder_art")).toEqual([
        ["webdav:/music/Artist/Album/CD1", MIRRORED],
      ]);
    }
  });

  it("keeps artwork the queue or recent plays still point at", async () => {
    // `mapRowToChild` hands these paths out as `Child.coverArt` and MMKV keeps
    // them, so an album deleted from the device must not blank its recent tile.
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [file("a.mp3")]);
    mockArtworkFiles.add("kept.jpg");
    mockArtworkFiles.add("orphan.jpg");
    mockPersistedNames.add("kept.jpg");

    await scanLibrary(["webdav:/music"], { enrich: false });

    expect([...mockArtworkFiles]).toEqual(["kept.jpg"]);
  });

  it("hides a cover the folder's ignore rules hide", async () => {
    dir("webdav:/music", [folder("Album")]);
    dir("webdav:/music/Album", [
      file(".ignore"),
      file("cover.jpg"),
      file("a.mp3"),
    ]);
    mockSource.openReader = () =>
      Promise.resolve({
        read: () =>
          Promise.resolve(
            new TextEncoder().encode("cover.jpg") as Uint8Array<ArrayBuffer>,
          ),
        close() {},
      });

    const result = await scanLibrary(["webdav:/music"], { enrich: false });

    expect(result.sidecarCovers).toBe(0);
    expect(mockDownloaded).toEqual([]);
  });
});
