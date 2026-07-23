// The in-flight map exists to collapse concurrent callers, not to remember
// results: the lasting cache is the file on disk. An entry that outlives its
// promise turns it into a cache that keeps handing out URIs to covers long
// after they've been deleted.

// A tiny in-memory filesystem standing in for expo-file-system, so the
// already-on-disk path — the one that used to leak — can actually be driven.
const mockFs = { files: new Set<string>(), downloads: 0, downloadOk: true };

const mockFile = (uri: string) => ({
  uri,
  get exists() {
    return mockFs.files.has(uri);
  },
  size: 4096,
  delete: () => mockFs.files.delete(uri),
  bytes: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), // JPEG magic
});

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///doc" },
  Directory: class {
    uri: string;
    exists = true;
    constructor(base: unknown, name: string) {
      this.uri = `${String(base)}/${name}`;
    }
    create() {}
    delete() {
      mockFs.files.clear();
    }
    toString() {
      return this.uri;
    }
  },
  File: Object.assign(
    class {
      uri: string;
      size = 4096;
      constructor(dir: { uri: string }, name: string) {
        this.uri = `${dir.uri}/${name}`;
      }
      get exists() {
        return mockFs.files.has(this.uri);
      }
      delete() {
        mockFs.files.delete(this.uri);
      }
      async bytes() {
        return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      }
    },
    {
      downloadFileAsync: async (_url: string, target: { uri: string }) => {
        mockFs.downloads++;
        if (mockFs.downloadOk) mockFs.files.add(target.uri);
        return mockFile(target.uri);
      },
    },
  ),
}));

import {
  clearDownloadedCovers,
  fetchReleaseCover,
} from "@/services/musicbrainz/coverArt";

beforeEach(() => {
  mockFs.files.clear();
  mockFs.downloads = 0;
  mockFs.downloadOk = true;
});

describe("fetchReleaseCover caching", () => {
  it("downloads once and reuses the file on disk", async () => {
    const first = await fetchReleaseCover("rel-1");
    const second = await fetchReleaseCover("rel-1");

    expect(first).toBe(second);
    expect(mockFs.downloads).toBe(1);
  });

  it("collapses concurrent callers onto one download", async () => {
    const [a, b, c] = await Promise.all([
      fetchReleaseCover("rel-1"),
      fetchReleaseCover("rel-1"),
      fetchReleaseCover("rel-1"),
    ]);

    expect(mockFs.downloads).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("re-fetches once the cover is deleted", async () => {
    // The leak: the on-disk path returns synchronously, so a `finally` inside
    // the task ran before the map insert had happened — the delete found
    // nothing, the insert landed after it, and the entry never went away. Every
    // later call then got that stale promise: a URI to a file that was gone.
    await fetchReleaseCover("rel-1");
    mockFs.files.clear();

    await fetchReleaseCover("rel-1");

    expect(mockFs.downloads).toBe(2);
  });

  it("does not serve a cover from a cleared archive", async () => {
    await fetchReleaseCover("rel-1");
    clearDownloadedCovers();
    mockFs.downloadOk = false;

    // With the entry retained this resolved to the deleted file's URI.
    expect(await fetchReleaseCover("rel-1")).toBeNull();
  });

  it("keeps no entry once a fetch has settled", async () => {
    await fetchReleaseCover("rel-1");
    await fetchReleaseCover("rel-2");
    mockFs.files.clear();

    // Both would still be resolvable from memory if entries were retained.
    await fetchReleaseCover("rel-1");
    await fetchReleaseCover("rel-2");

    expect(mockFs.downloads).toBe(4);
  });

  it("keeps no entry after a failed fetch either", async () => {
    mockFs.downloadOk = false;
    expect(await fetchReleaseCover("rel-1")).toBeNull();

    mockFs.downloadOk = true;
    expect(await fetchReleaseCover("rel-1")).not.toBeNull();
    expect(mockFs.downloads).toBe(2);
  });
});
