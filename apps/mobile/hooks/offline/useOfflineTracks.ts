import { useMemo } from "react";
import { offlineTrackToChild } from "@/services/offline/collections";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

// Hoisted, and a collator rather than localeCompare per comparison: with the
// whole library synced this sorts tens of thousands of rows during render.
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

// Offline fallback for the "All tracks" browse: every downloaded track, in the
// alphabetical order the server browse uses. `enabled: false` short-circuits the
// derivation so the list isn't rebuilt on every store write (download progress
// lands several times a second) while fresh server data is present.
export function useOfflineTracks(enabled = true): Child[] | undefined {
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    if (!enabled) return undefined;
    const tracks = Object.values(downloadedTracks)
      .map(offlineTrackToChild)
      .sort((a, b) => collator.compare(a.title ?? "", b.title ?? ""));
    return tracks.length > 0 ? tracks : undefined;
  }, [enabled, downloadedTracks]);
}
