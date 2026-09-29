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
  // The real path helpers, not a stand-in: the SAF lister is only correct if it
  // normalizes exactly the way `File` / `Directory` do. Resolved by path because
  // the package's `exports` map doesn't expose them.
  const { dirname, join } = require("node:path");
  const { PathUtilities } = jest.requireActual(
    join(
      dirname(require.resolve("expo-file-system/package.json")),
      "src/pathUtilities",
    ),
  );
  return {
    File: MockFile,
    Directory: MockDirectory,
    FileMode: { ReadOnly: "r" },
    Paths: PathUtilities,
  };
});

type SafState = {
  available: boolean;
  listings: Map<string, unknown[]>;
  failure: Error | null;
};

// The state lives inside the factory because device.ts asks whether the lister
// is available at import time, which runs before this file's own top level.
jest.mock("@/modules/scan-service", () => {
  const saf: SafState = { available: true, listings: new Map(), failure: null };
  return {
    __saf: saf,
    isSafListAvailable: () => saf.available,
    listDocuments: (uri: string) => {
      if (saf.failure) return Promise.reject(saf.failure);
      const records = saf.listings.get(uri);
      if (!records) throw new Error(`no SAF listing stubbed for ${uri}`);
      return Promise.resolve(records);
    },
  };
});

import { Directory, File } from "expo-file-system";
import { deviceFileSource } from "@/services/fileSource/device";
import { FileSourceError } from "@/services/fileSource/errors";

const mockSaf: SafState = jest.requireMock("@/modules/scan-service").__saf;

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
  mockSaf.available = true;
  mockSaf.listings.clear();
  mockSaf.failure = null;
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

describe("deviceFileSource.list over a SAF tree", () => {
  const TREE =
    "content://com.android.externalstorage.documents/tree/primary%3AMusic";
  const DOC = `${TREE}/document/primary%3AMusic`;

  it("maps native records onto the entries Directory.list() produced", async () => {
    // What `tracks.uri` and every track id already hold for this layout: a
    // file's URI as the provider built it, a directory's with a trailing slash,
    // and names read off the decoded document id.
    mockSaf.listings.set(TREE, [
      {
        uri: `${DOC}%2F01%20Intro.flac`,
        isDirectory: false,
        size: 4096,
        mtime: 1700000000000,
      },
      {
        uri: `${DOC}%2FLive%20Sets/`,
        isDirectory: true,
        size: 0,
        mtime: 1700000000500,
      },
    ]);

    expect(await deviceFileSource.list(TREE)).toEqual([
      {
        name: "01 Intro.flac",
        isDirectory: false,
        size: 4096,
        mtime: 1700000000000,
        path: `${DOC}%2F01%20Intro.flac`,
      },
      {
        name: "Live Sets",
        isDirectory: true,
        size: 0,
        mtime: 0,
        path: `${DOC}%2FLive%20Sets/`,
      },
    ]);
  });

  it("lists a subdirectory by the path the walk was handed", async () => {
    const sub = `${DOC}%2FLive%20Sets/`;
    mockSaf.listings.set(sub, [
      {
        uri: `${DOC}%2FLive%20Sets%2Fa.mp3`,
        isDirectory: false,
        size: 0,
        mtime: 0,
      },
    ]);

    const [entry] = await deviceFileSource.list(sub);
    expect(entry).toMatchObject({
      name: "a.mp3",
      path: `${DOC}%2FLive%20Sets%2Fa.mp3`,
      size: 0,
      mtime: 0,
    });
  });

  it("classifies a failed listing instead of reporting an empty folder", async () => {
    // An empty result reads as "every file here was deleted" and the prune acts
    // on it; a classified failure marks the scan incomplete instead.
    mockSaf.failure = new Error("Permission Denial");
    const listing = deviceFileSource.list(TREE);
    await expect(listing).rejects.toBeInstanceOf(FileSourceError);
    await expect(listing).rejects.toMatchObject({ code: "ERR_FS_SERVER" });
  });

  it("falls back to Directory.list() without the native lister", async () => {
    mockSaf.available = false;
    mockState.listings.set(TREE, [
      fileEntry("a.flac", `${DOC}%2Fa.flac`, 1, 2),
    ]);
    const [entry] = await deviceFileSource.list(TREE);
    expect(entry.path).toBe(`${DOC}%2Fa.flac`);
  });

  it("never routes a file:// directory through the SAF lister", async () => {
    mockState.listings.set("file:///Music", [
      fileEntry("a.flac", "file:///Music/a.flac", 1, 2),
    ]);
    const [entry] = await deviceFileSource.list("file:///Music");
    expect(entry.path).toBe("file:///Music/a.flac");
  });
});

describe("deviceFileSource.listConcurrency", () => {
  const load = (available: boolean): number => {
    mockSaf.available = available;
    let concurrency = 0;
    jest.isolateModules(() => {
      concurrency = require("@/services/fileSource/device").deviceFileSource
        .listConcurrency;
    });
    return concurrency;
  };

  it("overlaps native listings, matching LIST_THREADS in ScanServiceModule.kt", () => {
    expect(load(true)).toBe(4);
  });

  it("stays serial when every listing blocks the JS thread", () => {
    expect(load(false)).toBe(1);
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
