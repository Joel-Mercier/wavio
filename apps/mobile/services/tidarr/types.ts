export interface TidarrConfig {
  serverUrl: string;
  apiKey: string;
}

export type TidarrQuality = "low" | "normal" | "high" | "max";

// Only the item types the app queues. Tidarr also accepts playlist / mix /
// video / favorite_* — not wired up.
export type TidarrItemType = "album" | "track" | "artist";

export type TidarrQueueStatus =
  | "queue_download"
  | "download"
  | "queue_processing"
  | "processing"
  // Legacy, still produced by items restored from an older queue file.
  | "queue"
  | "finished"
  | "error";

// The payload POST /api/save expects, and the shape GET /api/queue/list gives
// back — Tidarr stores the item it was handed and annotates it in place.
export interface TidarrQueueItem {
  id: string;
  type: TidarrItemType | string;
  title: string;
  artist: string;
  // Omitted when the app defers to the instance: tiddl then falls back to the
  // quality in its own config rather than being handed one.
  quality?: TidarrQuality;
  status: TidarrQueueStatus;
  url: string;
  loading: boolean;
  error: boolean;
  progress?: { current: number; total: number };
}

export interface TidarrQueueResponse {
  total: number;
  offset: number;
  limit: number | null;
  queue: TidarrQueueItem[];
}

export interface TidarrSettings {
  noToken?: boolean;
  configErrors?: string[];
  parameters?: {
    LOCK_QUALITY?: string;
    ENABLE_HISTORY?: string;
    NO_DOWNLOAD?: string;
    TIDARR_VERSION?: string;
    [key: string]: string | undefined;
  };
  tiddl_config?: {
    auth?: { country_code?: string };
    download?: { track_quality?: TidarrQuality };
  };
}

// --- Tidal DTOs, as returned through Tidarr's /proxy/tidal passthrough ---

export interface TidalArtistRef {
  id: number | string;
  name: string;
  picture?: string | null;
}

export interface TidalAlbum {
  id: number | string;
  title: string;
  cover?: string | null;
  artists?: TidalArtistRef[];
  numberOfTracks?: number;
  releaseDate?: string;
  audioQuality?: string;
  explicit?: boolean;
  url?: string;
}

export interface TidalArtist {
  id: number | string;
  name: string;
  picture?: string | null;
  url?: string;
}

export interface TidalTrack {
  id: number | string;
  title: string;
  duration?: number;
  trackNumber?: number;
  volumeNumber?: number;
  explicit?: boolean;
  audioQuality?: string;
  url?: string;
  artists?: TidalArtistRef[];
  album?: { id: number | string; title?: string; cover?: string | null };
}

export interface TidalPagedList<T> {
  items: T[];
  totalNumberOfItems: number;
  limit?: number;
  offset?: number;
}

export interface TidalSearchResponse {
  albums?: TidalPagedList<TidalAlbum>;
  artists?: TidalPagedList<TidalArtist>;
  tracks?: TidalPagedList<TidalTrack>;
}

// /v1/pages/* answers with rows of modules; which module carries what depends
// on its `type`, so consumers narrow rather than index by position.
export interface TidalPageModule<T> {
  type?: string;
  title?: string;
  album?: TidalAlbum;
  artist?: TidalArtist;
  pagedList?: TidalPagedList<T>;
}

export interface TidalPageResponse<T> {
  id?: string;
  title?: string;
  rows?: { modules: TidalPageModule<T>[] }[];
}
