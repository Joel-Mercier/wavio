// Parsing the `207 Multi-Status` body a PROPFIND returns. The fixtures are the
// shapes real servers actually emit — the namespace prefix, whether `href` is a
// full URI or an absolute path, and whether missing properties come back in a
// second 404 propstat all vary between Nextcloud, rclone, Apache mod_dav and
// Caddy, and every one of those differences silently corrupts a listing.
import {
  decodePath,
  encodePath,
  hrefToPath,
  isMultistatus,
  parseMultistatus,
} from "@/services/fileSource/webdavMultistatus";

const multistatus = (responses: string, prefix = "d") => `<?xml version="1.0"?>
<${prefix}:multistatus xmlns:${prefix}="DAV:">${responses}</${prefix}:multistatus>`;

const collection = (href: string, prefix = "d") => `
  <${prefix}:response>
    <${prefix}:href>${href}</${prefix}:href>
    <${prefix}:propstat>
      <${prefix}:prop>
        <${prefix}:resourcetype><${prefix}:collection/></${prefix}:resourcetype>
      </${prefix}:prop>
      <${prefix}:status>HTTP/1.1 200 OK</${prefix}:status>
    </${prefix}:propstat>
  </${prefix}:response>`;

const file = (
  href: string,
  size: number,
  modified = "Tue, 12 Aug 2025 10:00:00 GMT",
  prefix = "d",
) => `
  <${prefix}:response>
    <${prefix}:href>${href}</${prefix}:href>
    <${prefix}:propstat>
      <${prefix}:prop>
        <${prefix}:resourcetype/>
        <${prefix}:getcontentlength>${size}</${prefix}:getcontentlength>
        <${prefix}:getlastmodified>${modified}</${prefix}:getlastmodified>
      </${prefix}:prop>
      <${prefix}:status>HTTP/1.1 200 OK</${prefix}:status>
    </${prefix}:propstat>
  </${prefix}:response>`;

describe("path encoding", () => {
  it("decodes ordinary escapes", () => {
    expect(decodePath("/Music/Back%20In%20Black.flac")).toBe(
      "/Music/Back In Black.flac",
    );
  });

  it("decodes an encoded slash into a separator — the documented limitation", () => {
    // Pinned so the trade-off is visible rather than discovered: a name
    // containing "/" gains a phantom directory level. Accepted because
    // filesystems forbid "/" in a name, so a server exposing real files can't
    // produce this. See the note on decodePath.
    expect(decodePath("/Music/AC%2FDC/x.flac")).toBe("/Music/AC/DC/x.flac");
  });

  it("survives a malformed escape instead of losing the listing", () => {
    expect(decodePath("/Music/100%.flac")).toBe("/Music/100%.flac");
  });

  it("round-trips a path with spaces and reserved characters", () => {
    const path = "/Music/Sigur Rós/() [2002]/01 - Untitled #1.flac";
    expect(decodePath(encodePath(path))).toBe(path);
  });

  it("encodes each segment without escaping the separators", () => {
    expect(encodePath("/Music/A B/c.flac")).toBe("/Music/A%20B/c.flac");
  });
});

describe("hrefToPath", () => {
  it("accepts an absolute path href", () => {
    expect(hrefToPath("/dav/Music/a.flac")).toBe("/dav/Music/a.flac");
  });

  it("accepts a full-URI href", () => {
    // RFC 4918's own examples use both forms, and servers disagree.
    expect(hrefToPath("https://nas.local:8443/dav/Music/a.flac")).toBe(
      "/dav/Music/a.flac",
    );
  });

  it("decodes percent escapes", () => {
    expect(hrefToPath("/dav/My%20Music/a%20b.flac")).toBe(
      "/dav/My Music/a b.flac",
    );
  });
});

describe("parseMultistatus", () => {
  it("reads children and drops the collection's own response", () => {
    const xml = multistatus(
      collection("/dav/Music/") +
        file("/dav/Music/a.flac", 4096) +
        collection("/dav/Music/Live/"),
    );

    expect(parseMultistatus(xml, "/dav", "/Music")).toEqual([
      {
        name: "a.flac",
        isDirectory: false,
        size: 4096,
        mtime: Date.parse("Tue, 12 Aug 2025 10:00:00 GMT"),
        path: "webdav:/Music/a.flac",
      },
      {
        name: "Live",
        isDirectory: true,
        size: 0,
        mtime: 0,
        path: "webdav:/Music/Live",
      },
    ]);
  });

  it("addresses entries relative to the base path, not the origin", () => {
    // Nextcloud serves DAV under /remote.php/dav/files/<user>. Storing the full
    // path would put the deployment's layout inside every track id.
    const xml = multistatus(
      file("/remote.php/dav/files/joel/Music/a.flac", 10),
    );
    const [entry] = parseMultistatus(
      xml,
      "/remote.php/dav/files/joel",
      "/Music",
    );
    expect(entry.path).toBe("webdav:/Music/a.flac");
  });

  it("handles an unusual namespace prefix", () => {
    // Apache mod_dav answers with lp1:/D: prefixes; they are stripped, not matched.
    const xml = multistatus(
      file("/dav/Music/a.mp3", 7, undefined, "lp1"),
      "lp1",
    );
    expect(parseMultistatus(xml, "/dav", "/Music")[0].name).toBe("a.mp3");
  });

  it("reads the 200 propstat when a server splits found and missing props", () => {
    const xml = multistatus(`
      <d:response>
        <d:href>/dav/Music/a.flac</d:href>
        <d:propstat>
          <d:prop><d:resourcetype/><d:getcontentlength>512</d:getcontentlength></d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
        <d:propstat>
          <d:prop><d:getlastmodified/></d:prop>
          <d:status>HTTP/1.1 404 Not Found</d:status>
        </d:propstat>
      </d:response>`);
    const [entry] = parseMultistatus(xml, "/dav", "/Music");
    expect(entry.size).toBe(512);
    expect(entry.mtime).toBe(0);
  });

  it("falls back to 0 for a missing or unparseable size and mtime", () => {
    // The incremental scan keys on (uri, size, mtime), so these have to be a
    // stable sentinel — NaN would compare unequal every run and re-extract the
    // whole library on every scan.
    const xml = multistatus(`
      <d:response>
        <d:href>/dav/Music/a.flac</d:href>
        <d:propstat>
          <d:prop><d:resourcetype/><d:getlastmodified>not a date</d:getlastmodified></d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
      </d:response>`);
    const [entry] = parseMultistatus(xml, "/dav", "/Music");
    expect(entry.size).toBe(0);
    expect(entry.mtime).toBe(0);
    expect(Number.isNaN(entry.mtime)).toBe(false);
  });

  it("treats a trailing slash as cosmetic and resourcetype as authoritative", () => {
    // Collections conventionally end in "/", but not every server does it, so
    // the collection element is what decides.
    const xml = multistatus(collection("/dav/Music/NoSlash"));
    const [entry] = parseMultistatus(xml, "/dav", "/Music");
    expect(entry).toMatchObject({
      name: "NoSlash",
      isDirectory: true,
      path: "webdav:/Music/NoSlash",
    });
  });

  it("decodes percent-encoded names into the stored address", () => {
    const xml = multistatus(file("/dav/Music/Sigur%20R%C3%B3s.flac", 3));
    const [entry] = parseMultistatus(xml, "/dav", "/Music");
    expect(entry.name).toBe("Sigur Rós.flac");
    expect(entry.path).toBe("webdav:/Music/Sigur Rós.flac");
  });

  it("works with an empty base path (share served at the origin root)", () => {
    const xml = multistatus(collection("/Music/") + file("/Music/a.flac", 1));
    expect(parseMultistatus(xml, "", "/Music").map((e) => e.path)).toEqual([
      "webdav:/Music/a.flac",
    ]);
  });

  it("ignores responses outside the base path", () => {
    const xml = multistatus(file("/elsewhere/a.flac", 1));
    expect(parseMultistatus(xml, "/dav", "/Music")).toEqual([]);
  });

  it("returns nothing for a body that isn't a multistatus", () => {
    expect(
      parseMultistatus("<html><body>Hi</body></html>", "/dav", "/"),
    ).toEqual([]);
  });
});

describe("isMultistatus", () => {
  it("accepts a real multistatus body", () => {
    expect(isMultistatus(multistatus(collection("/dav/")))).toBe(true);
  });

  it("rejects the things a LAN address actually answers with", () => {
    // The whole point of the liveness check: on a foreign network, the IP that
    // used to be the NAS is often somebody's router admin page.
    for (const body of [
      "<html><head><title>Login</title></head></html>",
      '{"error":"not found"}',
      "",
      "not xml at all",
    ]) {
      expect(isMultistatus(body)).toBe(false);
    }
  });
});
