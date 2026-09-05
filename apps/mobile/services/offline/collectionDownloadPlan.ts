import type { DownloadProgress, OfflineTrack } from "@/stores/offline";

// Pure decision logic for a collection's download state, kept free of stores
// and React so it can be unit-tested (see __tests__/collectionDownloadPlan.test.ts).
// The hook that reads the store and drives the UI is hooks/offline/useCollectionDownload.ts.

export type CollectionDownloadStatus =
  | "none" // nothing downloaded yet
  | "downloading" // at least one track in flight
  | "partial" // some (but not all) downloaded, none in flight
  | "all"; // every track downloaded

// How the server's current membership differs from what was downloaded.
export type CollectionDownloadDrift = {
  added: string[];
  removed: string[];
};

export const NO_DRIFT: CollectionDownloadDrift = { added: [], removed: [] };

export function collectionDownloadStatus(
  trackedIds: string[],
  downloadedTracks: Record<string, OfflineTrack>,
  downloadProgress: Record<string, DownloadProgress>,
): {
  total: number;
  downloadedCount: number;
  status: CollectionDownloadStatus;
} {
  const total = trackedIds.length;
  const downloadedCount = trackedIds.filter(
    (id) => id in downloadedTracks,
  ).length;
  const downloadingCount = trackedIds.filter((id) => {
    const progress = downloadProgress[id];
    return progress?.status === "downloading" || progress?.status === "pending";
  }).length;

  let status: CollectionDownloadStatus = "none";
  if (total > 0 && downloadedCount === total) status = "all";
  else if (downloadingCount > 0) status = "downloading";
  else if (downloadedCount > 0) status = "partial";

  return { total, downloadedCount, status };
}

/**
 * What the server has that the saved copy doesn't, and vice versa.
 *
 * `liveIds` being undefined means there is nothing to compare against — the
 * query is still loading, or paused because we're offline. That is not evidence
 * the server dropped anything, so it reports no drift rather than proposing to
 * delete the whole collection.
 */
export function collectionDrift(
  savedIds: string[] | undefined,
  liveIds: string[] | undefined,
): CollectionDownloadDrift {
  if (!savedIds || !liveIds) return NO_DRIFT;
  const saved = new Set(savedIds);
  const live = new Set(liveIds);
  return {
    added: liveIds.filter((id) => !saved.has(id)),
    removed: savedIds.filter((id) => !live.has(id)),
  };
}

/**
 * Every track id a collection has ever been recorded as owning.
 *
 * Removing downloads has to work off this union, not the live list: a smart
 * playlist re-drawn server-side (or an edited playlist) still has the tracks it
 * downloaded under its previous membership on disk, and deleting only what the
 * server currently returns strands the rest with nothing referencing them.
 */
export function collectionRemovalIds(
  savedIds: string[] | undefined,
  liveIds: string[] | undefined,
): string[] {
  return [...new Set([...(savedIds ?? []), ...(liveIds ?? [])])];
}
