// The OS media controls fetch `artworkUrl` natively and can't authenticate, so
// the cover is mirrored to a local file first. What matters here is *which* file
// a given cover URL maps to: the URL carries per-session auth params and (on
// Navidrome) an updated-at token, so keying on it verbatim would re-download
// every cover after each login and on every unrelated entity touch.

const JPEG = [0xff, 0xd8, 0xff, 0xe0];

// A body that passes the size floor, with `magic` as its first bytes.
const bodyWith = (magic: number[], length = 4096) => {
  const bytes = new Uint8Array(length);
  bytes.set(magic, 0);
  return bytes;
};

const mockFs = {
  files: new Map<string, Uint8Array>(),
  modificationTime: undefined as number | undefined,
};

const mockNet = {
  requests: [] as { url: string; headers?: Record<string, string> }[],
  body: bodyWith(JPEG),
  ok: true,
  status: 200,
};

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name: string) {
      this.uri = `${typeof dir === "string" ? dir : dir.uri}/${name}`;
      this.name = name;
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    get modificationTime() {
      return mockFs.modificationTime;
    }
    create() {
      mockFs.files.set(this.uri, new Uint8Array());
    }
    writeSync(bytes: Uint8Array | string, options?: { encoding?: string }) {
      mockFs.files.set(
        this.uri,
        typeof bytes === "string"
          ? new Uint8Array(Buffer.from(bytes, options?.encoding as never))
          : bytes,
      );
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
    moveSync(destination: { uri: string }) {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error("missing");
      mockFs.files.delete(this.uri);
      mockFs.files.set(destination.uri, bytes);
      this.uri = destination.uri;
    }
  }
  return {
    Paths: { cache: "file:///cache", document: "file:///doc" },
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
      list() {
        const prefix = `${this.uri}/`;
        return Array.from(mockFs.files.keys())
          .filter((uri) => uri.startsWith(prefix))
          .map((uri) => new MockFile(this, uri.slice(prefix.length)));
      }
      toString() {
        return this.uri;
      }
    },
    File: MockFile,
  };
});

const mockHeaders = jest.fn<Record<string, string> | undefined, [unknown]>();
jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: (url: unknown) => mockHeaders(url),
}));

import {
  cachedArtworkUri,
  clearArtworkCache,
  ensureArtworkCached,
  lockScreenPlaceholderUri,
  refreshArtworkIndex,
} from "@/services/lockScreenArtwork";

const HEADERS = { "CF-Access-Client-Id": "id" };

beforeEach(() => {
  mockFs.files.clear();
  mockFs.modificationTime = undefined;
  mockNet.requests = [];
  mockNet.body = bodyWith(JPEG);
  mockNet.ok = true;
  mockNet.status = 200;
  mockHeaders.mockReset();
  mockHeaders.mockReturnValue(HEADERS);
  // The mirror goes through RN's fetch, not expo-file-system's downloader —
  // only fetch carries the custom SSL socket factory a self-signed server needs.
  global.fetch = jest.fn(
    async (url: string, init?: { headers?: Record<string, string> }) => {
      mockNet.requests.push({ url, headers: init?.headers });
      return {
        ok: mockNet.ok,
        status: mockNet.status,
        arrayBuffer: async () => mockNet.body.buffer,
      };
    },
  ) as unknown as typeof fetch;
  clearArtworkCache();
});

describe("cache identity", () => {
  it("maps one cover to one file across sessions and updated-at tokens", async () => {
    // Same cover, three ways it can be requested: a fresh salt/token after a
    // re-login, and a moved Navidrome updated-at suffix.
    const a = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_6a6bc4c1&u=joel&t=aaa&s=111",
    );
    const b = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_6a6bc4c1&u=joel&t=zzz&s=999",
    );
    const c = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_79ffffff&u=joel&t=aaa&s=111",
    );

    expect(a).toBeDefined();
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Only the first one hit the network.
    expect(mockNet.requests).toHaveLength(1);
  });

  it("keeps different covers apart", async () => {
    const a = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_1&u=joel",
    );
    const b = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-def_1&u=joel",
    );
    expect(a).not.toBe(b);
    expect(mockNet.requests).toHaveLength(2);
  });

  it("keeps the same cover id on two servers apart", async () => {
    // Cover ids are only unique within a server, and the app holds several.
    const a = await ensureArtworkCached(
      "https://one.example.com/rest/getCoverArt?id=mf-abc_1&u=joel",
    );
    const b = await ensureArtworkCached(
      "https://two.example.com/rest/getCoverArt?id=mf-abc_1&u=joel",
    );
    expect(a).not.toBe(b);
    expect(mockNet.requests).toHaveLength(2);
  });

  it("keys Jellyfin path-style artwork on the path, ignoring the query", async () => {
    const a = await ensureArtworkCached(
      "https://jf.example.com/Items/abc/Images/Primary?tag=v1&maxWidth=300",
    );
    const b = await ensureArtworkCached(
      "https://jf.example.com/Items/abc/Images/Primary?tag=v1&maxWidth=600",
    );
    expect(b).toBe(a);
    expect(mockNet.requests).toHaveLength(1);
  });
});

describe("ensureArtworkCached", () => {
  it("sends the server's custom headers", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    await ensureArtworkCached(url);
    expect(mockNet.requests[0]?.headers).toEqual(HEADERS);
    expect(mockHeaders).toHaveBeenCalledWith(url);
  });

  it("ignores anything that isn't a remote URL", async () => {
    expect(
      await ensureArtworkCached("file:///local/cover.jpg"),
    ).toBeUndefined();
    expect(await ensureArtworkCached(undefined)).toBeUndefined();
    expect(await ensureArtworkCached("")).toBeUndefined();
    expect(mockNet.requests).toHaveLength(0);
  });

  it("discards an HTML error page served under an image URL", async () => {
    // What a proxy returns when the headers are missing — 403 with an HTML body.
    mockNet.body = bodyWith([0x3c, 0x21, 0x44, 0x4f]); // "<!DO"
    const result = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_1",
    );
    expect(result).toBeUndefined();
    expect(mockFs.files.size).toBe(0);
  });

  it("discards a truncated download", async () => {
    mockNet.body = bodyWith(JPEG, 12);
    const result = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_1",
    );
    expect(result).toBeUndefined();
  });

  it.each([
    ["a small PNG favicon", bodyWith([0x89, 0x50, 0x4e, 0x47], 300)],
    ["an ICO favicon", bodyWith([0x00, 0x00, 0x01, 0x00])],
    ["a BMP", bodyWith([0x42, 0x4d])],
    ["an AVIF", bodyWith([0, 0, 0, 0x1c, ...Buffer.from("ftypavif")])],
  ])("keeps %s, which the OS decoders read", async (_, body) => {
    mockNet.body = body;
    expect(
      await ensureArtworkCached("https://radio.example.com/favicon"),
    ).toBeDefined();
  });

  it("discards an MP4 that isn't an image", async () => {
    mockNet.body = bodyWith([0, 0, 0, 0x1c, ...Buffer.from("ftypM4A ")]);
    expect(
      await ensureArtworkCached("https://radio.example.com/favicon"),
    ).toBeUndefined();
  });

  it("writes nothing when the server refuses the request", async () => {
    mockNet.ok = false;
    mockNet.status = 403;
    const result = await ensureArtworkCached(
      "https://music.example.com/rest/getCoverArt?id=mf-abc_1",
    );
    expect(result).toBeUndefined();
    expect(mockFs.files.size).toBe(0);
  });

  it("collapses concurrent callers into a single download", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    const [a, b, c] = await Promise.all([
      ensureArtworkCached(url),
      ensureArtworkCached(url),
      ensureArtworkCached(url),
    ]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(mockNet.requests).toHaveLength(1);
  });
});

describe("cachedArtworkUri", () => {
  it("answers synchronously once the cover is mirrored", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1&t=aaa";
    expect(cachedArtworkUri(url)).toBeUndefined();
    const downloaded = await ensureArtworkCached(url);
    expect(cachedArtworkUri(url)).toBe(downloaded);
    // A later session asking for the same cover still hits.
    expect(
      cachedArtworkUri(
        "https://music.example.com/rest/getCoverArt?id=mf-abc_1&t=zzz",
      ),
    ).toBe(downloaded);
  });

  it("treats a local or missing artwork as nothing to mirror", () => {
    expect(cachedArtworkUri("file:///local/cover.jpg")).toBeUndefined();
    expect(cachedArtworkUri(undefined)).toBeUndefined();
  });

  it("misses once the entry is past its TTL", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    await ensureArtworkCached(url);
    expect(cachedArtworkUri(url)).toBeDefined();
    // Eight days old, in seconds — the backstop for a server whose cover URL
    // doesn't change when the artwork does. The age is read when the directory
    // is listed (a fresh process, or a caller about to do a burst of lookups),
    // not on every lookup.
    mockFs.modificationTime = Math.floor(Date.now() / 1000) - 8 * 86400;
    refreshArtworkIndex();
    expect(cachedArtworkUri(url)).toBeUndefined();
  });

  it("finds files that were on disk before this process listed the directory", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    await ensureArtworkCached(url);
    const uri = cachedArtworkUri(url);
    refreshArtworkIndex();
    expect(cachedArtworkUri(url)).toBe(uri);
  });

  it("answers from the index once listed, even if the file is gone", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    await ensureArtworkCached(url);
    const uri = cachedArtworkUri(url);
    expect(uri).toBeDefined();
    // The OS reclaimed the cache dir behind our back.
    mockFs.files.clear();
    // Per-item callers (a 20k-node browse tree) get the cheap answer …
    expect(cachedArtworkUri(url)).toBe(uri);
    // … one-shot callers ask for the truth, which also corrects the index.
    expect(cachedArtworkUri(url, { verify: true })).toBeUndefined();
    expect(cachedArtworkUri(url)).toBeUndefined();
  });

  it("does not touch the file system for a lookup after the first", async () => {
    const url = "https://music.example.com/rest/getCoverArt?id=mf-abc_1";
    await ensureArtworkCached(url);
    refreshArtworkIndex();
    cachedArtworkUri(url);
    const other = "https://music.example.com/rest/getCoverArt?id=mf-xyz_1";
    const exists = jest.spyOn(
      Object.getPrototypeOf(
        // biome-ignore lint/suspicious/noExplicitAny: test hook into the mock
        new (jest.requireMock("expo-file-system") as any).File(
          { uri: "file:///x" },
          "y",
        ),
      ),
      "exists",
      "get",
    );
    for (let i = 0; i < 1000; i++) {
      cachedArtworkUri(url);
      cachedArtworkUri(other);
    }
    expect(exists).not.toHaveBeenCalled();
    exists.mockRestore();
  });
});

describe("lockScreenPlaceholderUri", () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47];

  it("writes a PNG to the cache and hands out its file URL", () => {
    const uri = lockScreenPlaceholderUri();

    expect(uri).toMatch(/^file:\/\/\//);
    expect(
      Array.from(mockFs.files.get(uri as string)?.subarray(0, 4) ?? []),
    ).toEqual(PNG);
  });

  it("writes it again once the OS has cleared the cache", () => {
    const uri = lockScreenPlaceholderUri() as string;
    mockFs.files.delete(uri);

    expect(lockScreenPlaceholderUri()).toBe(uri);
    expect(mockFs.files.get(uri)?.byteLength).toBeGreaterThan(512);
  });

  it("replaces a write a killed process left half done", () => {
    const uri = lockScreenPlaceholderUri() as string;
    const full = mockFs.files.get(uri);
    mockFs.files.delete(uri);
    mockFs.files.set(`${uri}.tmp`, new Uint8Array([0x89, 0x50]));

    lockScreenPlaceholderUri();

    expect(mockFs.files.get(uri)).toEqual(full);
    expect(mockFs.files.has(`${uri}.tmp`)).toBe(false);
  });
});
