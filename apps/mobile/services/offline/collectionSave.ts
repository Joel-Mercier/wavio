import { offlineDownloadService } from "@/services/offline";
import {
  artworkCacheService,
  cacheArtworkForTracks,
} from "@/services/offline/artworkCacheService";
import { autoDownloadKey } from "@/services/offline/autoDownloadPlan";
import { collectionRemovalIds } from "@/services/offline/collectionDownloadPlan";
import type { Child } from "@/services/openSubsonic/types";
import useOffline, { type OfflineCollection } from "@/stores/offline";

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

// Runs at every registration point, and only once the collection is in the
// store: the collection's own cover is what the offline Library row renders,
// and the tracks resolve through it (an album's) or through their own album's
// (a playlist spanning several).
export function cacheCollectionArtwork(
  meta: DownloadCollectionMeta,
  songs: Child[],
) {
  artworkCacheService.enqueue(meta.coverArt);
  cacheArtworkForTracks(songs);
}

export function notYetDownloaded(songs: Child[]) {
  const { downloadedTracks } = useOffline.getState();
  return songs.filter((song) => !(song.id in downloadedTracks));
}

// Registers the collection ahead of its tracks: the offline Library and the
// "downloaded" filter read the registration, so a collection registered only
// once every track landed was missing for the whole download, or for good when
// one track failed.
export function registerCollection(
  meta: DownloadCollectionMeta,
  songs: Child[],
  fields: Partial<
    Pick<OfflineCollection, "source" | "ruleVersion" | "savedAt">
  > = {},
) {
  useOffline.getState().addDownloadedCollection({
    ...meta,
    trackIds: songs.map((song) => song.id),
    songCount: songs.length,
    savedAt: new Date().toISOString(),
    ...fields,
  });
  cacheCollectionArtwork(meta, songs);
}

export async function saveCollection(
  meta: DownloadCollectionMeta | undefined,
  songs: Child[],
) {
  if (meta) {
    const key = autoDownloadKey(meta.kind, meta.id);
    const { autoDownloadOverrides, updateAutoDownloadOverrides } =
      useOffline.getState();
    if (autoDownloadOverrides[key]?.mode === "exclude") {
      updateAutoDownloadOverrides({ [key]: null });
    }
    registerCollection(meta, songs);
  }
  await offlineDownloadService.downloadTracks(notYetDownloaded(songs));
}

// Adopts the server's current membership: downloads what was added, deletes
// what was dropped, and repoints the saved list at it. The only path that
// replaces a registered collection's track list, so a track can never be
// orphaned by an overwrite.
export async function updateCollectionToServer(
  collection: OfflineCollection,
  meta: DownloadCollectionMeta,
  songs: Child[],
) {
  const liveIds = songs.map((song) => song.id);
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
    await offlineDownloadService.removeTracksNotReferencedElsewhere(
      meta.id,
      removed,
    );
    artworkCacheService.pruneOrphaned();
  }
  await offlineDownloadService.downloadTracks(notYetDownloaded(songs));
}

// Removing what an automatic download would fetch again excludes it from the
// rule, so it stays removed until the user saves it again.
function excludeFromAutoDownloads(
  meta: DownloadCollectionMeta,
  collection: OfflineCollection | undefined,
) {
  const state = useOffline.getState();
  const ruleOn =
    meta.kind === "album"
      ? state.autoDownloadLikedAlbums
      : state.autoDownloadPlaylists;
  if (collection?.source !== "rule" && !ruleOn) return;
  state.updateAutoDownloadOverrides({
    [autoDownloadKey(meta.kind, meta.id)]: {
      mode: "exclude",
      kind: meta.kind,
      name: meta.name,
    },
  });
}

export async function removeCollectionDownload(
  meta: DownloadCollectionMeta,
  collection: OfflineCollection | undefined,
  liveIds: string[] | undefined,
) {
  excludeFromAutoDownloads(meta, collection);
  // Union of both lists, not just the live one: a collection whose membership
  // drifted (or drifted before this hook tracked it) still owns the tracks it
  // downloaded under its previous membership, and passing only the current
  // list would strand them on disk with nothing left referencing them.
  await offlineDownloadService.removeCollection(
    meta.id,
    collectionRemovalIds(collection?.trackIds, liveIds),
  );
}
