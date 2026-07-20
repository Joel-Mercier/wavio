// Lidarr v1 REST API types. Only the fields the app consumes are modelled; the
// API returns many more. See https://lidarr.audio/docs/api/.

export interface LidarrConfig {
  serverUrl: string;
  apiKey: string;
}

export interface LidarrSystemStatus {
  appName?: string;
  version?: string;
  instanceName?: string;
}

export interface LidarrMediaCover {
  coverType: string;
  url?: string;
  remoteUrl?: string;
}

export interface LidarrRatings {
  votes?: number;
  value?: number;
}

// Album add options accepted by POST /album.
export interface LidarrAddAlbumOptions {
  addType?: "automatic" | "manual";
  searchForNewAlbum?: boolean;
}

export interface LidarrAddArtistOptions {
  monitor?: string;
  monitored?: boolean;
  searchForMissingAlbums?: boolean;
}

export interface LidarrArtist {
  id?: number;
  artistName: string;
  foreignArtistId: string;
  artistType?: string;
  disambiguation?: string;
  overview?: string;
  status?: string;
  images?: LidarrMediaCover[];
  genres?: string[];
  ratings?: LidarrRatings;
  remotePoster?: string;
  monitored?: boolean;
  qualityProfileId?: number;
  metadataProfileId?: number;
  rootFolderPath?: string;
  addOptions?: LidarrAddArtistOptions;
}

export interface LidarrAlbumRelease {
  foreignReleaseId: string;
  title?: string;
  trackCount?: number;
  duration?: number;
  mediumCount?: number;
  format?: string;
}

export interface LidarrAlbumStatistics {
  trackFileCount?: number;
  trackCount?: number;
  totalTrackCount?: number;
  sizeOnDisk?: number;
  percentOfTracks?: number;
}

export interface LidarrAlbum {
  id?: number;
  title: string;
  foreignAlbumId: string;
  disambiguation?: string;
  overview?: string;
  artistId?: number;
  albumType?: string;
  secondaryTypes?: string[];
  releaseDate?: string;
  genres?: string[];
  duration?: number;
  images?: LidarrMediaCover[];
  remoteCover?: string;
  ratings?: LidarrRatings;
  monitored?: boolean;
  anyReleaseOk?: boolean;
  releases?: LidarrAlbumRelease[];
  artist?: LidarrArtist;
  statistics?: LidarrAlbumStatistics;
  addOptions?: LidarrAddAlbumOptions;
}

// One entry of GET /search — either an artist or an album is populated.
export interface LidarrSearchResult {
  id: number;
  foreignId: string;
  artist?: LidarrArtist;
  album?: LidarrAlbum;
}

export interface LidarrQualityProfile {
  id: number;
  name: string;
}

export interface LidarrMetadataProfile {
  id: number;
  name: string;
}

export interface LidarrRootFolder {
  id: number;
  path: string;
  name?: string;
  accessible?: boolean;
  freeSpace?: number;
  defaultQualityProfileId?: number;
  defaultMetadataProfileId?: number;
}

// The persisted defaults applied when adding an album (chosen in the filters
// sheet).
export interface LidarrAddDefaults {
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
}
