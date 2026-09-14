import { Directory, File, FileMode } from "expo-file-system";
import { FileSourceError } from "./errors";
import {
  ensureRootsResolved,
  isLocalFolderUri,
  parseLocalFolderUri,
  toCanonical,
  toFileUri,
} from "./localFolderUris";
import type { ByteReader, FileSource, RemoteEntry } from "./types";

// The on-device file source: the behaviour the local library had before the
// seam existed, expressed through it. Its canonical URIs are exactly the
// `file://` / `content://` URIs expo-file-system hands out, so `tracks.uri`,
// every track id derived from it, and `streamUrl`'s output are unchanged.
//
// The one exception is an iOS root, addressed as `local-folder://<rootId>/…`
// (see ./localFolderUris.ts for why): those are swapped for the root's current
// `file://` location on the way in, and listed entries are swapped back on the
// way out, so nothing above this seam sees a path that moves between launches.

// Each extraction is native I/O plus a JS-side raw-tag read, so a small pool
// overlaps the two without flooding either.
const EXTRACT_CONCURRENCY = 4;

// `Directory.list()` below is synchronous, so listing directories "in parallel"
// would only interleave blocking calls on the one JS thread — with the walk's
// bookkeeping added on top. Serial is what this source actually wants.
const LIST_CONCURRENCY = 1;

const deviceReader = (path: string): ByteReader => {
  const handle = new File(path).open(FileMode.ReadOnly);
  return {
    read(offset: number, length: number): Promise<Uint8Array> {
      handle.offset = offset;
      return Promise.resolve(handle.readBytes(length));
    },
    close() {
      handle.close();
    },
  };
};

// Resolves an iOS root address to the `file://` it currently lives at. An
// unresolved root — its folder deleted, its bookmark refused — is reported the
// way a revoked SAF grant is: unreadable, but not proof the files are gone.
async function resolve(path: string): Promise<string> {
  if (!isLocalFolderUri(path)) return path;
  await ensureRootsResolved();
  const uri = toFileUri(path);
  if (uri == null) {
    throw new FileSourceError("ERR_FS_SERVER", `folder unavailable: ${path}`);
  }
  return uri;
}

// A listed entry that doesn't sit under its root's resolved `file://` is a
// prefix disagreement (`/private/var` vs `/var`, an encoding mismatch) that
// would otherwise put the moving path into `tracks.uri` and every id derived
// from it — exactly what the root scheme exists to prevent. Refusing the listing
// keeps that visible; the scanner counts it as an unreadable folder.
function canonicalOf(rootId: string, fileUri: string): string {
  const canonical = toCanonical(rootId, fileUri);
  if (canonical == null) {
    throw new FileSourceError(
      "ERR_FS_SERVER",
      `entry ${fileUri} is outside root ${rootId}`,
    );
  }
  return canonical;
}

export const deviceFileSource: FileSource = {
  kind: "device",
  extractConcurrency: EXTRACT_CONCURRENCY,
  listConcurrency: LIST_CONCURRENCY,

  // SAF folders picked on Android are content:// tree URIs; bare absolute paths
  // get the file:// scheme. Anything already carrying a scheme is passed
  // through untouched.
  normalizeRoot(root: string): string {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(root) ? root : `file://${root}`;
  },

  async exists(path: string): Promise<boolean> {
    return new Directory(await resolve(path)).exists;
  },

  async list(path: string): Promise<RemoteEntry[]> {
    const resolved = await resolve(path);
    const rootId = parseLocalFolderUri(path)?.rootId;
    // `Directory.list()` is synchronous and returns size/mtime on the entry, so
    // a device listing needs no per-file stat — the same shape a PROPFIND
    // `Depth: 1` or an SMB directory query returns.
    //
    // A throw here is classified rather than left raw so the scanner's prune
    // guard can treat all three sources identically. On this device a listing
    // failure means the directory is genuinely unreadable (deleted, or a
    // revoked SAF grant) rather than a transient link problem — but it is still
    // not proof the files are gone, so it maps to a code the prune won't act on.
    let entries: ReturnType<Directory["list"]>;
    try {
      entries = new Directory(resolved).list();
    } catch (error) {
      throw new FileSourceError(
        "ERR_FS_SERVER",
        `list ${path}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
    return entries.map((entry) => {
      const isDirectory = !(entry instanceof File);
      return {
        name: entry.name,
        isDirectory,
        size: isDirectory ? 0 : ((entry as File).size ?? 0),
        mtime: isDirectory ? 0 : ((entry as File).modificationTime ?? 0),
        path: rootId == null ? entry.uri : canonicalOf(rootId, entry.uri),
      };
    });
  },

  async openReader(path: string): Promise<ByteReader> {
    return deviceReader(await resolve(path));
  },

  // Already a URI the player, the native metadata reader and the waveform
  // decoder can open directly — or, for an iOS root, the `file://` it maps to.
  // Synchronous by contract, so it reads the roots restored at startup; a root
  // that isn't resolved yet yields the address itself, which fails to open the
  // same way a missing file does.
  playableUrl(path: string): string {
    return isLocalFolderUri(path) ? (toFileUri(path) ?? path) : path;
  },

  // Nothing to reach: the files are on this device.
  probe(): Promise<boolean> {
    return Promise.resolve(true);
  },
};
