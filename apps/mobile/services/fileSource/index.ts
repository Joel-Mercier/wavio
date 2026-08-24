// Reads the active server type straight from the auth store rather than through
// `activeServerType()` in services/backend/dispatch: dispatch imports the local
// backend's `localUnsupported`, which pulls config/i18n and the whole zod locale
// set into the graph of anything that only wanted a playable URL.
import { useAuthBase } from "@/stores/auth";
import type { ServerType } from "@/stores/servers";
import { deviceFileSource } from "./device";
import type { FileSource } from "./types";

export { deviceFileSource } from "./device";
export type {
  ByteReader,
  FileSource,
  FileSourceKind,
  RemoteEntry,
} from "./types";

// Network sources are resolved lazily, for the same reason the auth store is
// imported directly above: `webdav.ts` reaches services/serverHeaders and from
// there stores/servers and MMKV, and `services/backend/streaming.ts` calls into
// this module on every track change. Eagerly linking that chain would put the
// whole servers store in the graph of anything that just wanted a stream URL —
// which is native-module weight the on-device and media-server paths never need.
// Same lazy-require idiom as config/queryClient.ts.
let webdav: FileSource | null = null;
function webdavSource(): FileSource {
  if (!webdav) {
    webdav = (require("./webdav") as typeof import("./webdav"))
      .webdavFileSource;
  }
  return webdav;
}

let smb: FileSource | null = null;
function smbSource(): FileSource {
  if (!smb) {
    smb = (require("./smb") as typeof import("./smb")).smbFileSource;
  }
  return smb;
}

/**
 * The file source backing a given server type.
 *
 * Non-index-backed types have no file source of their own — their bytes come
 * from a media server's stream endpoint — so they fall through to the device
 * source, which is what the offline-download paths read from anyway.
 */
export function fileSourceFor(type: ServerType): FileSource {
  switch (type) {
    case "webdav":
      return webdavSource();
    case "smb":
      return smbSource();
    default:
      return deviceFileSource;
  }
}

/** The file source backing the active server. */
export function activeFileSource(): FileSource {
  return fileSourceFor(useAuthBase.getState().serverType);
}

/** Test seam: drop the memoized network sources. */
export function __resetFileSources(): void {
  webdav = null;
  smb = null;
}
