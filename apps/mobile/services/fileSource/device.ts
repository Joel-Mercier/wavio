import { Directory, File, FileMode } from "expo-file-system";
import { FileSourceError } from "./errors";
import type { ByteReader, FileSource, RemoteEntry } from "./types";

// The on-device file source: the behaviour the local library had before the
// seam existed, expressed through it. Its canonical URIs are exactly the
// `file://` / `content://` URIs expo-file-system hands out, so `tracks.uri`,
// every track id derived from it, and `streamUrl`'s output are unchanged.

// Each extraction is native I/O plus a JS-side raw-tag read, so a small pool
// overlaps the two without flooding either.
const EXTRACT_CONCURRENCY = 4;

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

export const deviceFileSource: FileSource = {
  kind: "device",
  extractConcurrency: EXTRACT_CONCURRENCY,

  // SAF folders picked on Android are content:// tree URIs; bare absolute paths
  // get the file:// scheme. Anything already carrying a scheme is passed
  // through untouched.
  normalizeRoot(root: string): string {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(root) ? root : `file://${root}`;
  },

  exists(path: string): Promise<boolean> {
    return Promise.resolve(new Directory(path).exists);
  },

  list(path: string): Promise<RemoteEntry[]> {
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
      entries = new Directory(path).list();
    } catch (error) {
      throw new FileSourceError(
        "ERR_FS_SERVER",
        `list ${path}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
    return Promise.resolve(
      entries.map((entry) => {
        const isDirectory = !(entry instanceof File);
        return {
          name: entry.name,
          isDirectory,
          size: isDirectory ? 0 : ((entry as File).size ?? 0),
          mtime: isDirectory ? 0 : ((entry as File).modificationTime ?? 0),
          path: entry.uri,
        };
      }),
    );
  },

  openReader(path: string): Promise<ByteReader> {
    return Promise.resolve(deviceReader(path));
  },

  // Already a URI the player, the native metadata reader and the waveform
  // decoder can open directly.
  playableUrl(path: string): string {
    return path;
  },

  // Nothing to reach: the files are on this device.
  probe(): Promise<boolean> {
    return Promise.resolve(true);
  },
};
