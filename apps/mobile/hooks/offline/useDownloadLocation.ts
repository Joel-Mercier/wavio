import { Directory } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  type DownloadLocationStatus,
  isRestrictedTreeUri,
  isSupportedTreeUri,
  probeDownloadLocation,
  resetDownloadDestinationCache,
} from "@/services/offline/downloadDestination";
import useApp, { useAppBase } from "@/stores/app";
import { logError } from "@/utils/log";

export type PickDownloadLocationResult =
  | "picked"
  | "cancelled"
  | "restricted"
  | "unsupported"
  | "unwritable";

// The folder offline downloads are written to, and whether it still works.
//
// Android only: `Directory.pickDirectoryAsync` takes a persistable SAF grant
// there, while on iOS it grants access for the current app session only, so a
// folder picked on iOS would silently stop working at the next launch. The row
// that uses this hook isn't rendered off Android; `supported` is what says so.
export function useDownloadLocation() {
  // Plain selector form, never `useApp.use.downloadLocationUri()`: the React
  // Compiler only recognizes a call as a hook by its `use*` call-site name, so
  // the member form is memoized as a normal call and skips the underlying store
  // hook on some renders — shifting every hook after it out of order.
  const downloadLocationUri = useApp((s) => s.downloadLocationUri);
  const [status, setStatus] = useState<DownloadLocationStatus>("app-storage");
  const supported = Platform.OS === "android";

  // Probes the folder this render knows about, so it re-runs whenever the
  // setting changes rather than only on mount: the row and the section that
  // owns it each hold their own copy of this hook, so a folder picked in one
  // has to reach the other — otherwise a warning about storage that has since
  // been replaced outlives it until the screen remounts.
  const refresh = useCallback(() => {
    probeDownloadLocation(supported ? downloadLocationUri : null)
      .then(setStatus)
      .catch(() => setStatus("unavailable"));
  }, [downloadLocationUri, supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectAppStorage = useCallback(() => {
    resetDownloadDestinationCache();
    useAppBase.getState().setDownloadLocationUri(null);
    setStatus("app-storage");
  }, []);

  const pick = useCallback(async (): Promise<PickDownloadLocationResult> => {
    let picked: Directory;
    try {
      picked = await Directory.pickDirectoryAsync();
    } catch (error) {
      // The picker rejects on cancel as well as on failure, and the two aren't
      // distinguishable from JS — treating both as "cancelled" costs a silent
      // no-op in the rare failure case, which beats an error toast every time
      // someone backs out of the picker.
      logError("[useDownloadLocation] Directory picker dismissed", error);
      return "cancelled";
    }

    // Android 11+ refuses to grant the Download/ root and the app-data
    // sandboxes, but the picker still hands back a URI for them.
    if (isRestrictedTreeUri(picked.uri)) return "restricted";

    // The picker also offers cloud providers, whose opaque document ids no
    // folder name can be read back out of — writable, but every download would
    // land in a freshly uniquified `Artist (n)`.
    if (!isSupportedTreeUri(picked.uri)) return "unsupported";

    const probed = await probeDownloadLocation(picked.uri);
    if (probed !== "ok") return "unwritable";

    resetDownloadDestinationCache();
    useAppBase.getState().setDownloadLocationUri(picked.uri);
    setStatus("ok");
    return "picked";
  }, []);

  return {
    supported,
    downloadLocationUri,
    status,
    pick,
    selectAppStorage,
    refresh,
  };
}
