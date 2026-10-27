import { Directory } from "expo-file-system";

const WRITE_PROBE_NAME = "wavio-write-test.tmp";

// Whether a folder the user picked can still be written to. A SAF grant is
// revocable from Android's settings and the volume can be unmounted, so callers
// check this at startup as well as right after picking.
//
// Creating a real document *is* the write test: `exists` alone can't tell a
// read-only tree from a writable one, and the picker still returns a URI for
// trees API 30+ refuses to grant (Download/, Android/data).
export function probeWritableTree(uri: string): boolean {
  try {
    const root = new Directory(uri);
    if (!root.exists) return false;
    const probe = root.createFile(WRITE_PROBE_NAME, "application/octet-stream");
    if (probe.exists) probe.delete();
    return true;
  } catch {
    return false;
  }
}
