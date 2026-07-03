// Offline hooks, grouped by concern:
// - useDownloads        — download state (tracks/collections/progress/size) + actions
// - useCollectionDownload — save/remove a playlist or album for offline
// - useOfflineAvailability — "can I open/play this offline?" (track/collection/detail)
// - useOfflineCollection  — reconstruct a saved collection for rendering/playback
// - useOfflineSearch3     — offline search over downloads + persisted cache

export {
  type CollectionDownloadStatus,
  type DownloadCollectionMeta,
  useCollectionDownload,
} from "./useCollectionDownload";
export {
  useDownloadedCollections,
  useDownloadedTracksCount,
  useDownloadedTracksList,
  useDownloadProgress,
  useOfflineDownloads,
  useOfflineModeEnabled,
  useTotalDownloadSize,
} from "./useDownloads";
export {
  useIsCollectionAvailableOffline,
  useIsDetailCached,
  useIsTrackAvailableOffline,
} from "./useOfflineAvailability";
export { useOfflineAlbum, useOfflinePlaylist } from "./useOfflineCollection";
export { useOfflineSearch3 } from "./useOfflineSearch3";
