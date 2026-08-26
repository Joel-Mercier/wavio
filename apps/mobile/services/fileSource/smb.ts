import {
  type SmbTarget,
  smbBridgeUrl,
  smbExists,
  smbList,
  smbProbe,
} from "@/modules/smb";
import { useAuthBase } from "@/stores/auth";
import { FileSourceError, fromSmbError } from "./errors";
import { httpRangeReader } from "./httpRange";
import {
  normalizeSmbRoot,
  parseSmbUrl,
  SMB_ADDRESS_PREFIX,
  smbPathOf,
  splitDomainUser,
} from "./smbAddress";
import type { ByteReader, FileSource, RemoteEntry } from "./types";

// An SMB share as a file source. Listing goes to the native module; bytes come
// back over the loopback HTTP bridge it runs, because nothing downstream speaks
// SMB — not Media3, not MediaMetadataRetriever, not `File.downloadFileAsync`.
//
// Ranged reads deliberately go through that same bridge rather than a second
// native read function: one path to get right, and it means a plain scan already
// exercises the code playback depends on.
//
// Addresses are `smb:` + a path relative to the *share* (not the host), so the
// LAN address never enters a track id and the library survives the NAS moving.

// Lower than WebDAV's 12. Each extracted file costs a bridge GET from the native
// metadata reader plus two ranged reads, all multiplexed over one SMB session,
// and consumer NAS boxes cap concurrent opens well below a web server's worker
// pool.
const EXTRACT_CONCURRENCY = 6;

// Applies to the SMB operation behind a call, not to the loopback hop. Matches
// the WebDAV source so a wedged share fails a folder rather than the whole scan.
const REQUEST_TIMEOUT_MS = 20000;

// The reachability probe has its own budget in services/backend/probe.ts
// (PROBE_TIMEOUT_MS), so it must not wait anywhere near as long.
const PROBE_TIMEOUT_MS = 3500;

/**
 * The active server as an SMB target.
 *
 * Credentials come from the auth store rather than the saved server row, so a
 * session whose password was never persisted still works. The share name lives in
 * the URL and an optional NTLM domain in the username (`DOMAIN\user`), which is
 * why a share needs no `Server` fields of its own.
 */
function activeTarget(): SmbTarget {
  const { url, username, password } = useAuthBase.getState();
  const parsed = parseSmbUrl(url);
  if (!parsed) {
    throw new FileSourceError(
      "ERR_FS_UNREACHABLE",
      `Not an SMB share URL: ${url}`,
    );
  }
  const { domain, user } = splitDomainUser(username);
  return { ...parsed, domain, username: user, password };
}

function pathOrThrow(address: string): string {
  const path = smbPathOf(address);
  if (path == null) {
    throw new FileSourceError(
      "ERR_FS_NOT_FOUND",
      `Not an SMB address: ${address}`,
    );
  }
  return path;
}

const toEntry = (
  path: string,
  entry: { name: string; isDirectory: boolean; size: number; mtime: number },
): RemoteEntry => ({
  name: entry.name,
  isDirectory: entry.isDirectory,
  size: entry.size,
  mtime: entry.mtime,
  path: `${SMB_ADDRESS_PREFIX}${path === "/" ? "" : path}/${entry.name}`,
});

export const smbFileSource: FileSource = {
  kind: "smb",
  extractConcurrency: EXTRACT_CONCURRENCY,

  normalizeRoot(root: string): string {
    return normalizeSmbRoot(root);
  },

  /**
   * Whether the path is there.
   *
   * `false` means the share said so. A rejected credential or an unreachable
   * host throws instead, because the scanner prunes tracks for a folder that
   * reports absent and must never do that on a link failure.
   */
  async exists(address: string): Promise<boolean> {
    const path = smbPathOf(address);
    if (path == null) {
      throw new FileSourceError(
        "ERR_FS_NOT_FOUND",
        `Not an SMB address: ${address}`,
      );
    }
    try {
      return await smbExists(activeTarget(), path, REQUEST_TIMEOUT_MS);
    } catch (error) {
      const failure = fromSmbError(error, `exists ${path}`);
      if (failure.code === "ERR_FS_NOT_FOUND") return false;
      throw failure;
    }
  },

  async list(address: string): Promise<RemoteEntry[]> {
    const path = pathOrThrow(address);
    try {
      const entries = await smbList(activeTarget(), path, REQUEST_TIMEOUT_MS);
      return entries.map((entry) => toEntry(path, entry));
    } catch (error) {
      throw fromSmbError(error, `list ${path}`);
    }
  },

  openReader(address: string): Promise<ByteReader> {
    const path = pathOrThrow(address);
    // No headers: the bridge authenticates on the token in the URL, and the
    // share's real credentials never leave the native module.
    return Promise.resolve(
      httpRangeReader({
        url: smbBridgeUrl(activeTarget(), path, REQUEST_TIMEOUT_MS),
        timeoutMs: REQUEST_TIMEOUT_MS,
      }),
    );
  },

  // Synchronous by contract (see FileSource): the bridge starts itself on this
  // call, which is why it can be the first thing a cold start does.
  playableUrl(address: string): string {
    const path = smbPathOf(address);
    if (path == null) return address;
    try {
      return smbBridgeUrl(activeTarget(), path, REQUEST_TIMEOUT_MS);
    } catch (error) {
      // No usable server configured, or the bridge wouldn't start. Returning the
      // address unchanged lets the caller fail on an unplayable URI rather than
      // throwing during a track change (the contract is synchronous), but this
      // is never expected — it surfaces downstream as expo-audio's opaque
      // "Source error", so record why here or the cause is unrecoverable.
      // Lazy-required on the failure path only: services/errorReporting reaches
      // network → probe → jellyfin → MMKV, and this module is on the track-change
      // hot path. Same reasoning as the lazy sources in ./index.ts.
      (
        require("@/services/errorReporting") as typeof import("@/services/errorReporting")
      ).reportError(error, {
        area: "local-library",
        backend: "smb",
        endpoint: "playableUrl",
      });
      return address;
    }
  },

  // Reachability is a yes/no by contract, so unlike `exists` this one swallows
  // the reason.
  async probe(): Promise<boolean> {
    try {
      return await smbProbe(activeTarget(), PROBE_TIMEOUT_MS);
    } catch {
      return false;
    }
  },
};
