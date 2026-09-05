import { useCallback, useEffect, useMemo } from "react";
import { offlineDownloadService } from "@/services/offline";
import {
  artworkCacheService,
  cacheArtworkForTracks,
} from "@/services/offline/artworkCacheService";
import {
  type CollectionDownloadDrift,
  collectionDownloadStatus,
  collectionDrift,
  collectionRemovalIds,
} from "@/services/offline/collectionDownloadPlan";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";

export type {
  CollectionDownloadDrift,
  CollectionDownloadStatus,
} from "@/services/offline/collectionDownloadPlan";

// Metadata persisted alongside the downloaded tracks so the collection can be
// listed (and reopened) in the Library while offline, even when the server list
// query isn't cached. Omit it for ad-hoc multi-track downloads that aren't a
// browsable collection.
export type DownloadCollectionMeta = {
  id: string;
  kind: "playlist" | "album";
  name: string;
  coverArt?: string;
  owner?: string;
  artist?: string;
  artistId?: string;
  artists?: { id: string; name: string }[];
  year?: number;
};

// Runs at both registration points, and only once the collection is in the
// store: the collection's own cover is what the offline Library row renders,
// and the tracks resolve through it (an album's) or through their own album's
// (a playlist spanning several).
function cacheCollectionArtwork(meta: DownloadCollectionMeta, songs: Child[]) {
  artworkCacheService.enqueue(meta.coverArt);
  cacheArtworkForTracks(songs);
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
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  const downloadProgress = useOffline((s) => s.downloadProgress);
  const collection = useOffline((s) =>
    meta ? s.downloadedCollections[meta.id] : undefined,
  );

  const liveIds = useMemo(() => songs?.map((song) => song.id), [songs]);

  // The saved list wins once there is one; before the first save there is
  // nothing but the live list to measure against.
  const trackedIds = collection?.trackIds ?? liveIds;

  const { total, downloadedCount, status } = useMemo(
    () =>
      collectionDownloadStatus(
        trackedIds ?? [],
        downloadedTracks,
        downloadProgress,
      ),
    [trackedIds, downloadedTracks, downloadProgress],
  );

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
  // available.
  useEffect(() => {
    if (!meta || isRegistered || status !== "all" || !songs?.length) return;
    useOffline.getState().addDownloadedCollection({
      ...meta,
      trackIds: songs.map((song) => song.id),
      songCount: songs.length,
      savedAt: new Date().toISOString(),
    });
    cacheCollectionArtwork(meta, songs);
  }, [meta, isRegistered, status, songs]);

  // Adopts the server's current membership: downloads what was added, deletes
  // what was dropped, and repoints the saved list at it. The only path that
  // replaces a registered collection's track list, so a track can never be
  // orphaned by an overwrite.
  const updateToServer = useCallback(async () => {
    if (!meta || !collection || !songs || !liveIds) return;
    const live = new Set(liveIds);
    const removed = collection.trackIds.filter((id) => !live.has(id));
    // Spread the existing collection first so `source` survives: an auto copy
    // written by the library sync must stay auto, or disabling extended offline
    // mode would no longer clean it up.
    useOffline.getState().addDownloadedCollection({
      ...collection,
      ...meta,
      trackIds: liveIds,
      songCount: liveIds.length,
      savedAt: new Date().toISOString(),
    });
    cacheCollectionArtwork(meta, songs);
    if (removed.length) {
      offlineDownloadService.removeTracksNotReferencedElsewhere(
        meta.id,
        removed,
      );
      artworkCacheService.pruneOrphaned();
    }
    const pending = songs.filter((song) => !(song.id in downloadedTracks));
    await offlineDownloadService.downloadTracks(pending);
  }, [meta, collection, songs, liveIds, downloadedTracks]);

  const saveAll = useCallback(async () => {
    if (!songs?.length) return;
    // A re-save of an already registered collection is an update, and has to go
    // through the same path: overwriting `trackIds` with the live list here
    // would leave whatever left the collection on disk, referenced by nothing —
    // `removeAll` unions the saved and live lists, so it would never reach them
    // either. Reachable from both the header badge and the sheet row, which
    // still offer "save" while the status is `partial`.
    if (collection) return updateToServer();
    // Register the collection before the tracks download, not after:
    // `downloadTracks` resolves only once every track has landed and rejects if
    // one of them fails, so registering afterwards left the collection out of
    // the offline Library — and out of the "downloaded" filter — for the whole
    // download, or permanently when a single track failed. The library sync
    // registers its collections the same way, ahead of the queued tracks.
    if (meta) {
      useOffline.getState().addDownloadedCollection({
        ...meta,
        trackIds: songs.map((song) => song.id),
        songCount: songs.length,
        savedAt: new Date().toISOString(),
      });
      cacheCollectionArtwork(meta, songs);
    }
    const pending = songs.filter((song) => !(song.id in downloadedTracks));
    await offlineDownloadService.downloadTracks(pending);
  }, [songs, downloadedTracks, meta, collection, updateToServer]);

  const removeAll = useCallback(async () => {
    if (meta) {
      // Union of both lists, not just the live one: a collection whose
      // membership drifted (or drifted before this hook tracked it) still owns
      // the tracks it downloaded under its previous membership, and passing
      // only the current list would strand them on disk with nothing left
      // referencing them.
      offlineDownloadService.removeCollection(
        meta.id,
        collectionRemovalIds(collection?.trackIds, liveIds),
      );
      return;
    }
    if (!songs?.length) return;
    for (const song of songs) {
      if (song.id in downloadedTracks) {
        offlineDownloadService.removeDownloadedTrack(song.id);
      }
    }
    artworkCacheService.pruneOrphaned();
  }, [songs, downloadedTracks, meta, collection, liveIds]);

  return {
    total,
    downloadedCount,
    status,
    drift,
    saveAll,
    updateToServer,
    removeAll,
  };
}
