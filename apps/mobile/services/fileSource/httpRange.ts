import axios from "axios";
import type { ByteReader } from "./types";

// Ranged reads over HTTP, shared by every network file source: WebDAV talks to
// the share directly, SMB talks to its own loopback bridge. Both want the same
// two things — a `Range` request, and a fallback for a server that ignores it.

export type HttpRangeReaderOptions = {
  url: string;
  /**
   * Resolved per request rather than captured, so a credential change mid-scan
   * is picked up. A loopback bridge passes nothing.
   */
  headers?: () => Record<string, string>;
  timeoutMs: number;
};

export function httpRangeReader(options: HttpRangeReaderOptions): ByteReader {
  const { url, headers, timeoutMs } = options;
  return {
    async read(offset: number, length: number): Promise<Uint8Array> {
      if (length <= 0) return new Uint8Array(0);
      const response = await axios.get(url, {
        headers: {
          ...headers?.(),
          Range: `bytes=${offset}-${offset + length - 1}`,
        },
        timeout: timeoutMs,
        responseType: "arraybuffer",
        // 206 is the answer we want; a server that ignores Range replies 200
        // with the whole file, which `slice` below trims back to the request.
        // 416 is handled below rather than thrown, because a zero-byte file
        // answers it to every range — and an empty `.ignore` marker is exactly
        // that (see services/local/ignoreRules.ts).
        validateStatus: (status) =>
          status === 206 || status === 200 || status === 416,
      });
      if (response.status === 416) {
        // Two different things arrive as 416: an empty file, and a server that
        // refuses an over-long `last-byte-pos` instead of clamping it as RFC
        // 9110 asks. Only the required `Content-Range: bytes */N` separates
        // them, and getting it wrong turns a real pattern list into an empty
        // marker — which hides a whole folder on a scan that still reports
        // itself complete. With no length to go on, fail loudly instead.
        const total = totalFromContentRange(
          response.headers?.["content-range"],
        );
        if (total === 0) return new Uint8Array(0);
        throw new Error(
          `Range not satisfiable (416) for bytes=${offset}-${offset + length - 1}`,
        );
      }
      const bytes = new Uint8Array(response.data as ArrayBuffer);
      return response.status === 200
        ? bytes.slice(offset, offset + length)
        : bytes;
    },
    close() {
      // Stateless: each range is its own request.
    },
  };
}

/** The total length N from a Content-Range of the form "bytes X-Y/N". */
function totalFromContentRange(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /\/\s*(\d+)\s*$/.exec(value);
  return match ? Number(match[1]) : undefined;
}
