// The device file source is the seam's identity case: it must reproduce exactly
// what the local library did before `FileSource` existed, because `tracks.uri`
// (and every track id derived from it) and the URL handed to expo-audio all flow
// through it. A behaviour change here silently reindexes an existing library, or
// makes it unplayable.

// `mock`-prefixed so the jest.mock factory below may close over it.
const mockState: {
  listings: Map<string, unknown[]>;
  existing: Set<string>;
  handle: { offset: number; reads: number[]; closed: number } | null;
} = { listings: new Map(), existing: new Set(), handle: null };

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    name = "";
    size: number | null = null;
    modificationTime: number | null = null;
    constructor(uri: string) {
      this.uri = uri;
    }
    open() {
      const handle = { offset: 0, reads: [] as number[], closed: 0 };
      mockState.handle = handle;
      return {
        get offset() {
          return handle.offset;
        },
        set offset(value: number) {
          handle.offset = value;
        },
        readBytes(length: number) {
          handle.reads.push(length);
          return new Uint8Array(length);
        },
        close() {
          handle.closed++;
        },
      };
    }
  }
  class MockDirectory {
    uri: string;
    name = "";
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockState.existing.has(this.uri);
    }
    list() {
      const entries = mockState.listings.get(this.uri);
      if (!entries) throw new Error(`no listing stubbed for ${this.uri}`);
      return entries;
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    FileMode: { ReadOnly: "r" },
  };
});

import { Directory, File } from "expo-file-system";
import { deviceFileSource } from "@/services/fileSource/device";
import {
  __resetLocalFolderUris,
  registerRootsRestorer,
  setResolvedRoot,
} from "@/services/fileSource/localFolderUris";

// `entry instanceof File` is how the source tells files from directories, so the
// fixtures have to be real instances of the mocked classes.
const fileEntry = (
  name: string,
  uri: string,
  size: number | null,
  mtime: number | null,
) => Object.assign(new File(uri), { name, size, modificationTime: mtime });

const dirEntry = (name: string, uri: string) =>
  Object.assign(new Directory(uri), { name });

beforeEach(() => {
  mockState.listings.clear();
  mockState.existing.clear();
  mockState.handle = null;
});

describe("deviceFileSource.normalizeRoot", () => {
  it("adds the file:// scheme to a bare absolute path", () => {
    expect(deviceFileSource.normalizeRoot("/storage/emulated/0/Music")).toBe(
      "file:///storage/emulated/0/Music",
    );
  });

  it("leaves an already-schemed URI untouched", () => {
    // Android SAF folders arrive as content:// tree URIs and must not be rewritten.
    for (const root of [
      "file:///storage/Music",
      "content://com.android.externalstorage.documents/tree/primary%3AMusic",
    ]) {
      expect(deviceFileSource.normalizeRoot(root)).toBe(root);
    }
  });
});

describe("deviceFileSource.list", () => {
  it("reports size and mtime off the entry, with no extra stat", async () => {
    mockState.listings.set("file:///Music", [
      fileEntry("a.flac", "file:///Music/a.flac", 4096, 1700000000000),
      dirEntry("Sub", "file:///Music/Sub"),
    ]);

    expect(await deviceFileSource.list("file:///Music")).toEqual([
      {
        name: "a.flac",
        isDirectory: false,
        size: 4096,
        mtime: 1700000000000,
        path: "file:///Music/a.flac",
      },
      {
        name: "Sub",
        isDirectory: true,
        size: 0,
        mtime: 0,
        path: "file:///Music/Sub",
      },
    ]);
  });

  it("substitutes 0 for an unreported size or mtime", async () => {
    // The incremental scan keys on (uri, size, mtime), so a null has to become a
    // stable 0 — undefined would make every scan see a change and re-extract.
    mockState.listings.set("file:///Music", [
      fileEntry("a.mp3", "file:///Music/a.mp3", null, null),
    ]);
    const [entry] = await deviceFileSource.list("file:///Music");
    expect(entry.size).toBe(0);
    expect(entry.mtime).toBe(0);
  });
});

describe("deviceFileSource.playableUrl", () => {
  it("is the identity, so the URI reaches the player unchanged", () => {
    for (const uri of [
      "file:///storage/emulated/0/Music/a.flac",
      "content://media/external/audio/media/42",
    ]) {
      expect(deviceFileSource.playableUrl(uri)).toBe(uri);
    }
  });
});

describe("deviceFileSource.openReader", () => {
  it("seeks and reads through a single handle, then closes it", async () => {
    const reader = await deviceFileSource.openReader("file:///Music/a.flac");

    const header = await reader.read(0, 10);
    await reader.read(10, 32);
    reader.close();

    expect(header).toHaveLength(10);
    expect(mockState.handle?.reads).toEqual([10, 32]);
    expect(mockState.handle?.offset).toBe(10);
    expect(mockState.handle?.closed).toBe(1);
  });
});

describe("deviceFileSource reachability", () => {
  it("is always reachable — the files are on this device", async () => {
    expect(await deviceFileSource.probe()).toBe(true);
  });

  it("reports whether a configured root exists", async () => {
    expect(await deviceFileSource.exists("file:///nope")).toBe(false);
    mockState.existing.add("file:///yes");
    expect(await deviceFileSource.exists("file:///yes")).toBe(true);
  });
});

// An iOS root is addressed as `local-folder://<rootId>/…` and swapped for its
// current `file://` location only at this seam — see
// services/fileSource/localFolderUris.ts for why the stable form matters.
describe("deviceFileSource with an iOS folder root", () => {
  const ROOT = "local-folder://music";

  beforeEach(() => {
    __resetLocalFolderUris();
    setResolvedRoot("music", "file:///var/App/ABC/Documents/Music/");
  });

  it("lists through the resolved folder and hands back canonical paths", async () => {
    mockState.listings.set("file:///var/App/ABC/Documents/Music", [
      fileEntry(
        "a.flac",
        "file:///var/App/ABC/Documents/Music/a.flac",
        4096,
        1700000000000,
      ),
      dirEntry("Sub", "file:///var/App/ABC/Documents/Music/Sub/"),
    ]);

    expect(await deviceFileSource.list(ROOT)).toEqual([
      expect.objectContaining({ name: "a.flac", path: `${ROOT}/a.flac` }),
      expect.objectContaining({ name: "Sub", path: `${ROOT}/Sub` }),
    ]);
  });

  it("refuses a listing whose entries don't sit under the root", async () => {
    // A raw `file://` slipping through here would end up in `tracks.uri` and
    // every id derived from it — the moving path the root scheme keeps out.
    mockState.listings.set("file:///var/App/ABC/Documents/Music", [
      fileEntry(
        "a.flac",
        "file:///private/var/App/ABC/Documents/Music/a.flac",
        4096,
        1700000000000,
      ),
    ]);

    await expect(deviceFileSource.list(ROOT)).rejects.toMatchObject({
      code: "ERR_FS_SERVER",
    });
  });

  it("resolves exists, openReader and playableUrl against the current location", async () => {
    mockState.existing.add("file:///var/App/ABC/Documents/Music");
    expect(await deviceFileSource.exists(ROOT)).toBe(true);

    const reader = await deviceFileSource.openReader(`${ROOT}/Sub/b.mp3`);
    reader.close();
    expect(mockState.handle).not.toBeNull();

    expect(deviceFileSource.playableUrl(`${ROOT}/Sub/b.mp3`)).toBe(
      "file:///var/App/ABC/Documents/Music/Sub/b.mp3",
    );
  });

  it("follows the root when it moves, keeping every canonical path", async () => {
    // The container UUID changes on every app update; ids must not.
    setResolvedRoot("music", "file:///var/App/XYZ/Documents/Music");
    expect(deviceFileSource.playableUrl(`${ROOT}/a.flac`)).toBe(
      "file:///var/App/XYZ/Documents/Music/a.flac",
    );
  });

  it("classifies an unresolved root as unreadable, never as gone", async () => {
    // Same code a revoked SAF grant produces: the prune guard leaves the index
    // alone.
    await expect(
      deviceFileSource.list("local-folder://missing"),
    ).rejects.toMatchObject({ code: "ERR_FS_SERVER" });
    expect(deviceFileSource.playableUrl("local-folder://missing/a.flac")).toBe(
      "local-folder://missing/a.flac",
    );
  });

  it("waits for the registered restore before resolving", async () => {
    __resetLocalFolderUris();
    let restored = false;
    registerRootsRestorer(async () => {
      restored = true;
      setResolvedRoot("music", "file:///Docs/Music");
    });
    mockState.listings.set("file:///Docs/Music", []);
    expect(await deviceFileSource.list(ROOT)).toEqual([]);
    expect(restored).toBe(true);
  });
});
