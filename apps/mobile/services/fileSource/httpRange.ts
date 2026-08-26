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
        validateStatus: (status) => status === 206 || status === 200,
      });
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
