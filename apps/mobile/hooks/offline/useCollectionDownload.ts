import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { offlineDownloadService } from "@/services/offline";
import { artworkCacheService } from "@/services/offline/artworkCacheService";
import { isUserOwned } from "@/services/offline/autoDownloadPlan";
import {
  type CollectionDownloadDrift,
  collectionDownloadStatus,
  collectionDrift,
} from "@/services/offline/collectionDownloadPlan";
import {
  type DownloadCollectionMeta,
  registerCollection,
  removeCollectionDownload,
  saveCollection,
  updateCollectionToServer,
} from "@/services/offline/collectionSave";
import type { Child } from "@/services/openSubsonic/types";
import useOffline, { type OfflineStore } from "@/stores/offline";

export type {
  CollectionDownloadDrift,
  CollectionDownloadStatus,
} from "@/services/offline/collectionDownloadPlan";
export type { DownloadCollectionMeta } from "@/services/offline/collectionSave";

// Re-runs `compute` only when the tracked list or one of the two maps it reads
// is replaced: every other offline write (artwork, queue) reuses the last value.
function memoizeOverDownloadMaps<T>(
  trackedIds: string[] | undefined,
  compute: (ids: string[], state: OfflineStore) => T,
) {
  let downloaded: OfflineStore["downloadedTracks"] | undefined;
  let progress: OfflineStore["downloadProgress"] | undefined;
  let last: T | undefined;
  return (state: OfflineStore): T => {
    if (
      last === undefined ||
      state.downloadedTracks !== downloaded ||
      state.downloadProgress !== progress
    ) {
      downloaded = state.downloadedTracks;
      progress = state.downloadProgress;
      last = compute(trackedIds ?? [], state);
    }
    return last;
  };
}

export function useCollectionDownloadedCount(trackedIds: string[] | undefined) {
  const select = useMemo(
    () =>
      memoizeOverDownloadMaps(trackedIds, (ids, state) => {
        let count = 0;
        for (const id of ids) if (id in state.downloadedTracks) count++;
        return count;
      }),
    [trackedIds],
  );
  return useOffline(select);
}

// Drives the "Save for offline listening" / "Remove downloads" action on album
// and playlist detail sheets, plus the header badge. Reactive over the offline
// store so the row label and badge update as the queue drains. When `meta` is
// provided, the collection is also persisted so it shows up in the offline
// Library.
//
// Once a collection is registered, **its saved track list is what "downloaded"
// means** — not whatever the server is currently serving. A smart playlist
// sorted at random re-draws its members on every read (Navidrome evaluates
// `ORDER BY random() LIMIT n` afresh once its refresh delay lapses), so a
// status derived from the live list would flip to "partial" on every refetch
// and invite a re-save that downloads a near-entirely new set. Drift against
// the server is surfaced explicitly instead, through `drift` and
// `updateToServer`, so re-downloading is always something the user asked for.
export function useCollectionDownload(
  songs: Child[] | undefined,
  meta?: DownloadCollectionMeta,
) {
  const collection = useOffline((s) =>
    meta ? s.downloadedCollections[meta.id] : undefined,
  );
  const isRemoving = useSyncExternalStore(
    offlineDownloadService.subscribeRemovingCollections,
    () => !!meta && offlineDownloadService.isRemovingCollection(meta.id),
  );

  const liveIds = useMemo(() => songs?.map((song) => song.id), [songs]);

  // The saved list wins once there is one; before the first save there is
  // nothing but the live list to measure against.
  const trackedIds = collection?.trackIds ?? liveIds;

  // Only the coarse status, so a detail screen re-renders when the collection
  // changes state rather than on every track of a drain (issue #205). The
  // running count lives in useCollectionDownloadedCount, for the few leaves
  // that show it.
  const selectStatus = useMemo(
    () =>
      memoizeOverDownloadMaps(trackedIds, (ids, state) => {
        const { total, status } = collectionDownloadStatus(
          ids,
          state.downloadedTracks,
          state.downloadProgress,
        );
        return { total, status };
      }),
    [trackedIds],
  );
  const { total, status } = useOffline(useShallow(selectStatus));

  // Only meaningful with both lists in hand: `songs` is undefined while the
  // query loads, and while offline it may be paused entirely — neither is
  // evidence that the server dropped anything.
  const drift = useMemo<CollectionDownloadDrift>(
    () => collectionDrift(collection?.trackIds, liveIds),
    [collection?.trackIds, liveIds],
  );

  const isRegistered = !!collection || !meta;

  // Heal collections downloaded before the registration moved ahead of the
  // download: their tracks are on disk but no store entry was ever written, so
  // they are missing from the offline Library and the "downloaded" filter — and
  // the action has already flipped to "remove downloads", leaving no way to
  // save them again. Registering here also covers a collection whose tracks all
  // arrived through other saves, which the offline badge already counts as
  // available — but only hand saves: see isUserOwned.
  useEffect(() => {
    if (!meta || isRegistered || status !== "all" || !songs?.length) return;
    const { downloadedTracks } = useOffline.getState();
    if (!songs.every((song) => isUserOwned(downloadedTracks[song.id]))) return;
    registerCollection(meta, songs);
  }, [meta, isRegistered, status, songs]);

  const updateToServer = useCallback(async () => {
    if (!meta || !collection || !songs || !liveIds || isRemoving) return;
    await updateCollectionToServer(collection, meta, songs);
  }, [meta, collection, songs, liveIds, isRemoving]);

  const saveAll = useCallback(async () => {
    if (!songs?.length || isRemoving) return;
    // A re-save of an already registered collection is an update, and has to go
    // through the same path: overwriting `trackIds` with the live list here
    // would leave whatever left the collection on disk, referenced by nothing —
    // `removeAll` unions the saved and live lists, so it would never reach them
    // either. Reachable from both the header badge and the sheet row, which
    // still offer "save" while the status is `partial`.
    if (collection) return updateToServer();
    await saveCollection(meta, songs);
  }, [songs, meta, collection, updateToServer, isRemoving]);

  const removeAll = useCallback(async () => {
    if (meta) {
      await removeCollectionDownload(meta, collection, liveIds);
      return;
    }
    if (!songs?.length) return;
    const { downloadedTracks } = useOffline.getState();
    await offlineDownloadService.removeDownloadedTracks(
      songs.filter((song) => song.id in downloadedTracks).map((s) => s.id),
    );
    artworkCacheService.pruneOrphaned();
  }, [songs, meta, collection, liveIds]);

  return {
    total,
    trackedIds,
    status,
    isRegistered,
    isRemoving,
    drift,
    saveAll,
    updateToServer,
    removeAll,
  };
}
