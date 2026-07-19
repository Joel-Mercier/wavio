export { testConnection } from "@/services/lidarr/auth";
export {
  LidarrNotConfiguredError,
  lidarrRequest,
} from "@/services/lidarr/client";
export type { LidarrHistoryItem } from "@/services/lidarr/history";
export { fetchHistory } from "@/services/lidarr/history";
export {
  addAlbum,
  deleteArtist,
  downloadAddedAlbum,
  ensureArtistForBrowsing,
  getAddedAlbum,
  getArtistAlbums,
  getArtists,
  searchAlbum,
} from "@/services/lidarr/library";
export {
  getMetadataProfiles,
  getQualityProfiles,
  getRootFolders,
} from "@/services/lidarr/profiles";
export type { LidarrQueueItem } from "@/services/lidarr/queue";
export {
  cancelQueueItem,
  detectFinishedQueueItems,
  fetchQueue,
} from "@/services/lidarr/queue";
export type { LidarrRelease } from "@/services/lidarr/releases";
export { getReleases, grabRelease } from "@/services/lidarr/releases";
export {
  lookupAlbum,
  lookupAlbumsByArtist,
  search,
} from "@/services/lidarr/search";
export type {
  LidarrAddDefaults,
  LidarrAlbum,
  LidarrArtist,
  LidarrConfig,
  LidarrMediaCover,
  LidarrMetadataProfile,
  LidarrQualityProfile,
  LidarrRootFolder,
  LidarrSearchResult,
  LidarrSystemStatus,
} from "@/services/lidarr/types";
