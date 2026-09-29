// A mirror holds a fixed number of covers. When a caller wants more than that
// (the car browse tree does), evicting by age alone throws out the covers the
// last run mirrored to make room for this run's, and the cache never converges
// (issue #205). Callers pin what they still want; pruning evicts the rest first.

const JPEG = [0xff, 0xd8, 0xff, 0xe0];

const mockFiles = new Map<string, Uint8Array>();

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    name: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
      this.name = name;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get modificationTime() {
      return undefined;
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return {
    Paths: { cache: "file:///cache" },
    Directory: class {
      uri: string;
      exists = true;
      constructor(base: unknown, name: string) {
        this.uri = `${String(base)}/${name}`;
      }
      create() {}
      delete() {
        mockFiles.clear();
      }
      list() {
        const prefix = `${this.uri}/`;
        return Array.from(mockFiles.keys())
          .filter((uri) => uri.startsWith(prefix))
          .map((uri) => new MockFile(this, uri.slice(prefix.length)));
      }
    },
    File: MockFile,
  };
});

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => undefined,
}));

import { createArtworkMirror } from "@/services/artworkMirror";

const cover = (id: string) =>
  `https://music.example.com/rest/getCoverArt?id=${id}&size=600`;

let now = 1_700_000_000_000;

beforeEach(() => {
  mockFiles.clear();
  // Every download lands at a distinct, increasing time so "oldest" is defined.
  jest.spyOn(Date, "now").mockImplementation(() => (now += 1000));
  const body = new Uint8Array(4096);
  body.set(JPEG, 0);
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => body.buffer,
  })) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const mirrorAll = async (
  mirror: ReturnType<typeof createArtworkMirror>,
  ids: string[],
) => {
  for (const id of ids) await mirror.ensureArtworkCached(cover(id));
};

const held = (mirror: ReturnType<typeof createArtworkMirror>, ids: string[]) =>
  ids.filter((id) => mirror.cachedArtworkUri(cover(id)) !== undefined);

describe("prune", () => {
  it("evicts the oldest cover when nothing is pinned", async () => {
    const mirror = createArtworkMirror("unpinned", 2);

    await mirrorAll(mirror, ["a", "b", "c"]);

    expect(held(mirror, ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("evicts unpinned covers before pinned ones, whatever their age", async () => {
    const mirror = createArtworkMirror("pinned", 2);
    mirror.retain([cover("a")]);

    await mirrorAll(mirror, ["a", "b", "c"]);

    expect(held(mirror, ["a", "b", "c"])).toEqual(["a", "c"]);
  });

  it("falls back to the oldest pinned cover when the pins alone overflow", async () => {
    const mirror = createArtworkMirror("overflow", 2);
    mirror.retain(["a", "b", "c"].map(cover));

    await mirrorAll(mirror, ["a", "b", "c"]);

    expect(held(mirror, ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("replaces the pinned set on each retain", async () => {
    const mirror = createArtworkMirror("replaced", 2);
    mirror.retain([cover("a")]);
    mirror.retain([cover("b")]);

    await mirrorAll(mirror, ["a", "b", "c"]);

    expect(held(mirror, ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("forgets the pins when the cache is cleared", async () => {
    const mirror = createArtworkMirror("cleared", 2);
    mirror.retain([cover("a")]);
    mirror.clearArtworkCache();

    await mirrorAll(mirror, ["a", "b", "c"]);

    expect(held(mirror, ["a", "b", "c"])).toEqual(["b", "c"]);
  });
});
