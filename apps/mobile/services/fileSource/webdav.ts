import axios from "axios";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";
import { FileSourceError, fromHttpStatus, isFileSourceError } from "./errors";
import { httpRangeReader } from "./httpRange";
import type { ByteReader, FileSource, RemoteEntry } from "./types";
import {
  decodePath,
  encodePath,
  isMultistatus,
  parseMultistatus,
} from "./webdavMultistatus";

// A WebDAV share as a file source. Pure TypeScript — no native module — because
// every consumer downstream already speaks HTTP: expo-audio takes per-source
// headers, `File.downloadFileAsync` takes headers, and the native metadata
// reader has a URL+headers path.
//
// Addresses are `webdav:` + a path relative to the server's configured URL, so
// the host never enters an id and a share that moves to a new LAN address keeps
// its whole index (see services/fileSource/types.ts).

// Network extraction is latency-bound rather than CPU-bound, so the pool is much
// larger than the device source's 4. Sized to keep a LAN link busy without
// tripping the connection limits a small NAS actually enforces — Nextcloud's
// default php-fpm pool is a handful of workers, and overshooting turns a scan
// into a queue of timeouts.
const EXTRACT_CONCURRENCY = 12;

// Directory listings are cheap but not free; a first scan of a deep library is
// thousands of them. Well under the 15s the shared axios instances use, so a
// wedged share fails a folder rather than the whole scan.
const REQUEST_TIMEOUT_MS = 20000;

// `Depth: 1` is one round trip per directory and returns size + mtime for every
// child, which is what makes the incremental re-scan cost nothing per file.
const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:"><prop>
<resourcetype/><getcontentlength/><getlastmodified/>
</prop></propfind>`;

const ADDRESS_PREFIX = "webdav:";

/** The active server's base URL, without a trailing slash. */
function baseUrl(): string {
  return useAuthBase.getState().url.replace(/\/+$/, "");
}

/**
 * URL path the share's root sits at, decoded — everything after the origin in
 * the configured server URL (e.g. `/remote.php/dav/files/joel`).
 *
 * Entry addresses are made relative to this, so `href`s that come back as
 * absolute paths line up with ones that come back as full URIs.
 */
function basePath(): string {
  const url = baseUrl();
  const withoutOrigin = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  // Decoded to match `hrefToPath`, which decodes every `href` it returns: a
  // share URL with an escape in it (`/remote.php/dav/files/jean%20dupont`) would
  // otherwise prefix-match nothing, and an empty listing reads as an emptied
  // library.
  return decodePath(withoutOrigin.replace(/\/+$/, ""));
}

/** Source-relative path for an address, or null when it isn't one of ours. */
export function webdavPathOf(address: string): string | null {
  return address.startsWith(ADDRESS_PREFIX)
    ? address.slice(ADDRESS_PREFIX.length)
    : null;
}

/** Absolute request URL for a source-relative path. */
function urlFor(path: string): string {
  return `${baseUrl()}${encodePath(path)}`;
}

/**
 * One PROPFIND, returning the multistatus body.
 *
 * `validateStatus` accepts everything so a non-207 is classified here rather
 * than surfacing as an opaque AxiosError: the caller needs to know whether it
 * was the credentials, the path, or the server not speaking WebDAV at all. A
 * 207 that isn't parseable multistatus is treated the same as a 405 — something
 * answered, but it isn't a share.
 */
async function propfind(path: string, depth: "0" | "1"): Promise<string> {
  const url = urlFor(path);
  let response: { status: number; data: unknown };
  try {
    response = await axios.request({
      method: "PROPFIND",
      url,
      headers: {
        ...requestHeadersForUrl(url),
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8",
      },
      data: PROPFIND_BODY,
      timeout: REQUEST_TIMEOUT_MS,
      // Left as text: the body is XML, and axios' default JSON transform would
      // otherwise hand the parser a string it already tried and failed to parse.
      responseType: "text",
      transformResponse: [(body: string) => body],
      validateStatus: () => true,
    });
  } catch (error) {
    // No response at all — DNS, refused, timeout, TLS.
    throw fromHttpStatus(undefined, `PROPFIND ${path}`, error);
  }
  if (response.status !== 207) {
    throw fromHttpStatus(response.status, `PROPFIND ${path}`);
  }
  const body = response.data as string;
  if (!isMultistatus(body)) {
    throw new FileSourceError(
      "ERR_FS_NOT_SUPPORTED",
      `PROPFIND ${path}: 207 without a multistatus body`,
    );
  }
  return body;
}

export const webdavFileSource: FileSource = {
  kind: "webdav",
  extractConcurrency: EXTRACT_CONCURRENCY,

  // The configured library sub-path, as an address. An empty value scans the
  // whole share root.
  normalizeRoot(root: string): string {
    if (root.startsWith(ADDRESS_PREFIX)) return root;
    const trimmed = root.trim().replace(/\/+$/, "");
    if (!trimmed) return `${ADDRESS_PREFIX}/`;
    return `${ADDRESS_PREFIX}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  },

  /**
   * Whether the path is there.
   *
   * `false` means the server said so. Anything else — a 401, a timeout, a
   * captive portal answering 200 — throws, because the scanner prunes tracks
   * for a folder that reports absent and must never do that on a link failure.
   */
  async exists(address: string): Promise<boolean> {
    const path = webdavPathOf(address);
    if (path == null) {
      throw new FileSourceError(
        "ERR_FS_NOT_FOUND",
        `Not a WebDAV address: ${address}`,
      );
    }
    try {
      await propfind(path, "0");
      return true;
    } catch (error) {
      if (isFileSourceError(error) && error.code === "ERR_FS_NOT_FOUND") {
        return false;
      }
      throw error;
    }
  },

  async list(address: string): Promise<RemoteEntry[]> {
    const path = webdavPathOf(address);
    if (path == null) {
      throw new FileSourceError(
        "ERR_FS_NOT_FOUND",
        `Not a WebDAV address: ${address}`,
      );
    }
    const body = await propfind(path, "1");
    return parseMultistatus(body, basePath(), path);
  },

  openReader(address: string): Promise<ByteReader> {
    const path = webdavPathOf(address);
    if (path == null) {
      return Promise.reject(
        new FileSourceError(
          "ERR_FS_NOT_FOUND",
          `Not a WebDAV address: ${address}`,
        ),
      );
    }
    const url = urlFor(path);
    return Promise.resolve(
      httpRangeReader({
        url,
        headers: () => requestHeadersForUrl(url),
        timeoutMs: REQUEST_TIMEOUT_MS,
      }),
    );
  },

  // Synchronous by contract (see FileSource). Credentials never appear here —
  // they travel as an Authorization header resolved per host by
  // services/serverHeaders.ts, which the player, downloader and waveform
  // analyser all already consult.
  playableUrl(address: string): string {
    const path = webdavPathOf(address);
    return path == null ? address : urlFor(path);
  },

  // Reachability is a yes/no by contract, so unlike `exists` this one swallows
  // the reason. Callers that need it (login, the scan gate) go through the
  // throwing paths instead.
  async probe(): Promise<boolean> {
    try {
      return await webdavFileSource.exists(`${ADDRESS_PREFIX}/`);
    } catch {
      return false;
    }
  },
};
