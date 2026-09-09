import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  maybeAutoScan,
  subscribeScanCompleted,
} from "@/services/local/mediaLibraryScanning";
import { subscribeEffectiveOnline } from "@/services/network";
import useApp from "@/stores/app";

// Keeps an index-backed library (on-device, SMB, WebDAV) in step with what's
// actually on disk, without anyone pressing anything.
//
// Nothing on a network share can tell us a file appeared — no mobile client
// watches a NAS — so the only honest answer is to re-walk it at moments the user
// is plausibly about to look at their library: coming back to the app, and
// getting back onto the network. The walk is cheap by construction (the indexer
// skips every file whose size and mtime are unchanged), and `maybeAutoScan`
// owns every guard: server type, a scan already running, metered network,
// reachability, and the interval throttle.
//
// Mounted here rather than at the root layout because it needs an authenticated
// session and a hydrated local-library store — and because the first-login gate
// sits above this tree, so a scan is already running whenever this isn't mounted.
export default function LibraryAutoScanController() {
  const queryClient = useQueryClient();
  const intervalMinutes = useApp((s) => s.autoLibrarySyncIntervalMinutes);

  useEffect(() => {
    maybeAutoScan();
    const appState = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        if (status === "active") maybeAutoScan();
      },
    );
    const online = subscribeEffectiveOnline(maybeAutoScan);
    // Foregrounding covers the common case; this covers the session that stays
    // open for hours. The throttle inside `maybeAutoScan` is what actually
    // decides, so ticking at the interval is a floor rather than a schedule.
    const timer = setInterval(maybeAutoScan, intervalMinutes * 60_000);
    return () => {
      appState.remove();
      online();
      clearInterval(timer);
    };
  }, [intervalMinutes]);

  // A background scan has no screen to unmount, which is where the first-login
  // gate invalidates its queries. Without this a track added on the share sits
  // in the index unseen until react-query's staleTime expires.
  //
  // Artwork counts as a change on its own: a cover dropped into an otherwise
  // untouched folder — or an edit to the configured cover filenames — rewrites
  // art rows without indexing or removing a single track, and the cached
  // covers on screen are stale either way.
  useEffect(
    () =>
      subscribeScanCompleted((result) => {
        if (result.indexed + result.removed + result.artChanged === 0) return;
        void queryClient.invalidateQueries();
      }),
    [queryClient],
  );

  return null;
}
