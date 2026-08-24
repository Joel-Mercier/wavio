import { XMLParser } from "fast-xml-parser";
import type { RemoteEntry } from "./types";

// Parser for the `207 Multi-Status` body a WebDAV `PROPFIND` returns (RFC 4918
// §9.1). Kept pure and separate from the request side so the shapes real servers
// actually emit — Nextcloud, rclone, Apache mod_dav, Caddy — can be pinned in
// unit tests without a network.
//
// A `Depth: 1` PROPFIND answers with one `<response>` per child *plus* one for
// the collection itself, and each response carries `getcontentlength`,
// `getlastmodified` and `resourcetype`. That is exactly the `(size, mtime)` pair
// the indexer's incremental skip needs, which is why a re-scan costs one round
// trip per directory and none per file.

// Namespace prefixes vary wildly between servers (`D:`, `d:`, `lp1:`, `ns0:`),
// so they're stripped rather than matched. Values stay strings: `parseTagValue`
// would turn a 20-digit content length into a lossy float and a date-like name
// into a Date.
const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "response" || name === "propstat",
});

type Prop = {
  resourcetype?: unknown;
  getcontentlength?: string;
  getlastmodified?: string;
};

type PropStat = { prop?: Prop; status?: string };
type Response = { href?: string; propstat?: PropStat[] };

/**
 * Percent-decode a URL path, one segment at a time.
 *
 * Segment-wise so a single malformed escape costs one name rather than the whole
 * listing — decoding the joined string would throw and drop the entry entirely.
 *
 * A `%2F` inside a segment does still decode to a separator, so a file whose
 * *name* contains a slash would gain a phantom directory level and fail to
 * fetch. That is accepted rather than worked around: essentially every
 * filesystem forbids `/` in a name outright, so a WebDAV server exposing real
 * files cannot legitimately produce one, and the alternatives all mean carrying
 * an escaping scheme through `tracks.uri` and every track id.
 */
export function decodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        // A malformed escape is not worth losing the whole listing over.
        return segment;
      }
    })
    .join("/");
}

/** Percent-encode a source-relative path for use in a request URL. */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Strip a trailing slash, except from the root itself. */
const stripTrailingSlash = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

/**
 * The path part of an `href`, decoded.
 *
 * `href` is allowed to be an absolute URI *or* an absolute path (RFC 4918 uses
 * both in its examples, and servers differ), so both are accepted.
 */
export function hrefToPath(href: string): string {
  const withoutOrigin = /^[a-z][a-z0-9+.-]*:\/\//i.test(href)
    ? href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    : href;
  return decodePath(withoutOrigin || "/");
}

/** Pick the `prop` bag from the propstat whose status is a 2xx. */
function okProp(response: Response): Prop | undefined {
  const stats = response.propstat ?? [];
  // A server may split found and missing properties across two propstats (200
  // and 404); only the 200 one describes the resource.
  const ok = stats.find((s) => / 2\d\d /.test(` ${s.status ?? ""} `));
  return (ok ?? stats[0])?.prop;
}

function isCollection(prop: Prop | undefined): boolean {
  const rt = prop?.resourcetype;
  // `<resourcetype><collection/></resourcetype>` parses to an object with a
  // `collection` key; a file's empty `<resourcetype/>` parses to "".
  return typeof rt === "object" && rt !== null && "collection" in rt;
}

/**
 * Turn a multistatus body into entries addressed relative to `basePath`.
 *
 * @param xml       The 207 response body.
 * @param basePath  URL path the server's WebDAV root sits at (e.g.
 *                  `/remote.php/dav/files/joel`), decoded. Entry paths are made
 *                  relative to it, so the stored address survives the origin
 *                  changing.
 * @param selfPath  Source-relative path that was requested; its own `<response>`
 *                  is dropped so a directory never contains itself.
 */
export function parseMultistatus(
  xml: string,
  basePath: string,
  selfPath: string,
): RemoteEntry[] {
  const parsed = parser.parse(xml) as {
    multistatus?: { response?: Response[] };
  };
  const responses = parsed?.multistatus?.response;
  if (!responses) return [];

  const base = stripTrailingSlash(basePath);
  const self = stripTrailingSlash(selfPath) || "/";
  const entries: RemoteEntry[] = [];

  for (const response of responses) {
    if (!response.href) continue;
    const full = stripTrailingSlash(hrefToPath(response.href));
    if (base && !full.startsWith(base)) continue;
    const relative = full.slice(base.length) || "/";
    if (relative === self) continue;

    const prop = okProp(response);
    const directory = isCollection(prop);
    const name = relative.slice(relative.lastIndexOf("/") + 1);
    if (!name) continue;

    const declaredSize = Number(prop?.getcontentlength);
    const modified = prop?.getlastmodified
      ? Date.parse(prop.getlastmodified)
      : Number.NaN;

    entries.push({
      name,
      isDirectory: directory,
      // 0 rather than NaN/undefined: the incremental scan keys on (uri, size,
      // mtime), so an unreported value has to be a stable sentinel or every
      // scan would see a change and re-extract the whole library.
      size: directory || !Number.isFinite(declaredSize) ? 0 : declaredSize,
      mtime: Number.isFinite(modified) ? modified : 0,
      path: `webdav:${relative}`,
    });
  }
  return entries;
}

/** Whether a body is a parseable multistatus — the WebDAV liveness check. */
export function isMultistatus(xml: string): boolean {
  try {
    const parsed = parser.parse(xml) as { multistatus?: unknown };
    return parsed?.multistatus != null;
  } catch {
    return false;
  }
}
