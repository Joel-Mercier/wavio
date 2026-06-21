// Offline downloads: the imperative download manager (queue + disk I/O) and the
// pure mappers that reconstruct Subsonic-shaped data from downloaded files.
// Connectivity/reachability is a separate concern — see services/network.ts.

export {
  offlineCollectionToAlbum,
  offlineCollectionToPlaylist,
  offlineTrackToChild,
} from "./collections";
export {
  OfflineDownloadService,
  offlineDownloadService,
} from "./downloadService";
