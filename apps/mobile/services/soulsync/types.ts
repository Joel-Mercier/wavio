// SoulSync public REST API (/api/v1) types. Only the fields the app consumes
// are modelled; the API returns more.

export interface SoulSyncConfig {
  serverUrl: string;
  apiKey: string;
  profileId?: number;
}

// Every /api/v1 response is wrapped in this envelope, success or failure.
export interface SoulSyncEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  pagination: SoulSyncPagination | null;
}

export interface SoulSyncPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface SoulSyncSystemStatus {
  uptime: string;
  uptime_seconds: number;
  services: {
    spotify: boolean;
    // Soulseek is the download backend — nothing can be fetched without it.
    soulseek: boolean;
    hydrabase: boolean;
  };
}

// Search results use SoulSync's flat dataclass shape: artists are plain name
// strings and album is a name string, not nested objects.
export interface SoulSyncTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  image_url: string | null;
  release_date?: string;
}

export interface SoulSyncAlbum {
  id: string;
  name: string;
  artists: string[];
  release_date: string;
  total_tracks: number;
  album_type: string;
  image_url: string | null;
}

export interface SoulSyncArtist {
  id: string;
  name: string;
  popularity: number;
  genres: string[];
  followers: number;
  image_url: string | null;
}

// The provider a search result came from, echoed by every /search response.
// Doubles as the `source` a watchlist add must send.
export type SoulSyncSource =
  | "spotify"
  | "itunes"
  | "deezer"
  | "hydrabase"
  | "auto";

export interface SoulSyncSearchResults {
  tracks: SoulSyncTrack[];
  artists: SoulSyncArtist[];
  // The provider that actually answered, per result kind. A watchlist add must
  // echo the artist's source back, so this is load-bearing, not just metadata.
  trackSource?: string;
  artistSource?: string;
}

// One row of GET /downloads — a single track, not an album.
export interface SoulSyncDownloadTask {
  id: string;
  status: string;
  track_name: string | null;
  artist_name: string | null;
  // Not always a string: the endpoint falls back to the stored track payload's
  // `album` when the task carries no explicit album name, and that field is the
  // `{name, images}` object the wishlist requires. Read it via `albumNameOf`.
  album_name: string | { name?: string | null } | null;
  // Required to cancel the task; SoulSync needs the Soulseek peer it's
  // downloading from.
  username: string | null;
  filename: string | null;
  progress: number;
  size: number | null;
  error: string | null;
  batch_id: string | null;
  track_index: number | null;
  retry_count: number;
  status_change_time: string | null;
}

export interface SoulSyncDownloadsResponse {
  downloads: SoulSyncDownloadTask[];
  total: number;
  limit: number;
  offset: number;
}

// One row of GET /wishlist. A track sits here from the moment it's requested
// until it downloads successfully, at which point SoulSync deletes the row —
// so disappearing from this list is the success signal, not a status field.
export interface SoulSyncWishlistTrack {
  id: number;
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  // The opaque payload the row was created from, echoed back verbatim. It's the
  // only place /api/v1 exposes cover art for something being downloaded —
  // /downloads serialises no artwork field at all.
  track_data?: SoulSyncWishlistTrackData | null;
  retry_count: number;
  // Null until a download batch has actually tried this track.
  last_attempted: string | null;
  failure_reason: string | null;
}

export interface SoulSyncWishlistTrackData {
  album?: { name?: string | null; images?: { url?: string | null }[] } | null;
}

// One row of GET /watchlist. There is deliberately no `artist_id`: the table
// keeps one column per provider and populates exactly the one the artist came
// from, with `source` naming it. Read the id through `watchlistArtistId`.
export interface SoulSyncWatchlistArtist {
  id?: number;
  artist_name: string;
  source?: string | null;
  image_url?: string | null;
  spotify_artist_id?: string | null;
  itunes_artist_id?: string | null;
  deezer_artist_id?: string | null;
  discogs_artist_id?: string | null;
  musicbrainz_artist_id?: string | null;
  amazon_artist_id?: string | null;
  last_scan_timestamp?: string | null;
}

// One row of GET /library/recently-added?type=albums. The endpoint selects the
// album table straight, so there is no artist name to join onto — title, year
// and cover are all it can offer.
export interface SoulSyncLibraryAlbum {
  id: number;
  title: string | null;
  year: number | null;
  // A relative media-server path, not a URL — see services/soulsync/artwork.ts.
  thumb_url: string | null;
  // Which media server the scan read this row off, and therefore whose id space
  // `thumb_url` belongs to.
  server_source: string | null;
  created_at: string | null;
}
