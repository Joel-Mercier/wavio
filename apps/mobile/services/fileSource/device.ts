import { Directory, File, FileMode, Paths } from "expo-file-system";
import {
  type DocumentRecord,
  isSafListAvailable,
  listDocuments,
} from "@/modules/scan-service";
import { FileSourceError } from "./errors";
import type { ByteReader, FileSource, RemoteEntry } from "./types";

// The on-device file source: the behaviour the local library had before the
// seam existed, expressed through it. Its canonical URIs are exactly the
// `file://` / `content://` URIs expo-file-system hands out, so `tracks.uri`,
// every track id derived from it, and `streamUrl`'s output are unchanged.

// Each extraction is native I/O — which on Android also reads the tag region, so
// the JS side only parses it. Measured on a Redmi Note 13 over 11k files
// (issue #211): throughput doubles from 4 to 8, then flattens at 12 with
// MediaProvider saturated, so going higher only adds memory.
const EXTRACT_CONCURRENCY = 8;

// A SAF tree is listed natively off the JS thread, one provider query per
// directory, so a small pool overlaps them; must equal LIST_THREADS in
// ScanServiceModule.kt. Without that module `Directory.list()` is synchronous,
// and listing "in parallel" would only interleave blocking calls on the one JS
// thread.
const LIST_CONCURRENCY = isSafListAvailable() ? 4 : 1;

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

// Reproduces what `Directory.list()` would have handed back for the same child:
// the `File` / `Directory` constructors run `Paths.join`, the native `uri`
// getter drops a file's trailing slash and ensures a directory's, and `name` is
// the basename of that. `tracks.uri` and every track id derive from `path`, so
// drifting from it would re-extract or prune an existing library.
const safEntry = (record: DocumentRecord): RemoteEntry => {
  const joined = Paths.join(record.uri);
  const trailing = joined.endsWith("/");
  const path = record.isDirectory
    ? trailing
      ? joined
      : `${joined}/`
    : trailing
      ? joined.slice(0, -1)
      : joined;
  return {
    name: Paths.basename(path),
    isDirectory: record.isDirectory,
    size: record.isDirectory ? 0 : record.size,
    mtime: record.isDirectory ? 0 : record.mtime,
    path,
  };
};

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

  exists(path: string): Promise<boolean> {
    return Promise.resolve(new Directory(path).exists);
  },

  async list(path: string): Promise<RemoteEntry[]> {
    if (path.startsWith("content://") && isSafListAvailable()) {
      let records: DocumentRecord[];
      try {
        records = await listDocuments(path);
      } catch (error) {
        throw new FileSourceError(
          "ERR_FS_SERVER",
          `list ${path}: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
      return records.map(safEntry);
    }
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
    return entries.map((entry) => {
      const isDirectory = !(entry instanceof File);
      return {
        name: entry.name,
        isDirectory,
        size: isDirectory ? 0 : ((entry as File).size ?? 0),
        mtime: isDirectory ? 0 : ((entry as File).modificationTime ?? 0),
        path: entry.uri,
      };
    });
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
