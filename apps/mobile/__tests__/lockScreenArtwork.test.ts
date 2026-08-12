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
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
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
    write(bytes: Uint8Array) {
      mockFs.files.set(this.uri, bytes);
    }
    delete() {
      mockFs.files.delete(this.uri);
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
        return [];
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
    // doesn't change when the artwork does.
    mockFs.modificationTime = Math.floor(Date.now() / 1000) - 8 * 86400;
    expect(cachedArtworkUri(url)).toBeUndefined();
  });
});
