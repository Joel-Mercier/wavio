// Wire types for the AudioMuse-AI HTTP API (NeptuneHub/AudioMuse-AI). Field
// names are snake_case because they are the server's, not ours.

export interface AudioMuseConfig {
  serverUrl: string;
  /** Empty when the deployment runs with AUTH_ENABLED=false. */
  apiToken: string;
}

/** A track row as every AudioMuse list endpoint returns it. */
export interface AudioMuseTrack {
  item_id: string;
  title?: string;
  author?: string;
  album?: string;
  album_artist?: string;
  distance?: number;
  similarity?: number;
  is_seed?: boolean;
}

export interface AudioMuseHealth {
  status: string;
}

/** The payload both chat endpoints produce (the stream wraps it in `done`). */
export interface AudioMuseChatResponse {
  message?: string;
  original_request?: string;
  ai_provider_used?: string;
  ai_model_selected?: string;
  executed_query?: string | null;
  query_results?: { item_id: string; title?: string; artist?: string }[] | null;
}

/** One SSE frame from POST /chat/api/chatPlaylistStream. */
export type AudioMuseChatEvent =
  | { type: "log"; line?: string; t?: number }
  | { type: "error"; error?: string; t?: number }
  | { type: "done"; response?: AudioMuseChatResponse; t?: number };

/** POST /api/clap/search and /api/lyrics/search/text share this envelope. */
export interface AudioMuseSearchResponse {
  query?: string;
  count?: number;
  results?: AudioMuseTrack[];
}

/** Subset of GET /api/config the app actually reads. */
export interface AudioMuseServerConfig {
  ai_model_provider?: string;
  mood_labels?: string[] | string;
  top_n_moods?: number;
  alchemy_default_n_results?: number;
  alchemy_max_n_results?: number;
  alchemy_temperature?: number;
}

/**
 * GET /chat/api/config_defaults — what the prompt-playlist endpoints will
 * actually use. `default_ai_provider` is "NONE" when no LLM is configured.
 */
export interface AudioMuseChatDefaults {
  default_ai_provider?: string;
  default_ollama_model_name?: string;
  default_openai_model_name?: string;
  default_gemini_model_name?: string;
  default_mistral_model_name?: string;
}

/**
 * GET /api/clap/stats and /api/lyrics/stats. Only the `*_enabled` flags are
 * trustworthy: the rest describes the worker's *in-memory* index cache, so
 * `song_count` is 0 on a populated deployment that hasn't warmed it up yet. The
 * indexed-track counts come from the dashboard snapshot instead.
 */
export interface AudioMuseCacheStats {
  clap_enabled?: boolean;
  lyrics_enabled?: boolean;
  loaded?: boolean;
  song_count?: number;
}

/**
 * GET /api/dashboard/summary — `content` is a snapshot recomputed server-side
 * every 60s, never on the request path, so these counts lag by up to a minute.
 * A song only enters AudioMuse's catalogue when it is analysed, so `total_songs`
 * *is* the analysed-track count; `clap_indexed` is a genuine subset (CLAP is a
 * separate pass). Absent keys mean "no snapshot yet", which is not the same as 0.
 */
export interface AudioMuseDashboardSummary {
  content?: {
    total_songs?: number | null;
    clap_indexed?: number | null;
  };
  stats_updated_at?: string | null;
}

/**
 * GET /api/config/defaults — served by the sonic-fingerprint blueprint, so a
 * 404 means the deployment predates the feature. Never carries a secret: just
 * the type the credential form must render and the account to pre-fill.
 * `server_type` only exists from AudioMuse 3.0.0, hence resolveFingerprintServerType.
 */
export interface AudioMuseFingerprintDefaults {
  server_type?: string;
  /** jellyfin / emby deployments. */
  default_user_id?: string;
  /** navidrome (and Subsonic-family) deployments. */
  default_user?: string;
}

/**
 * GET /api/similar_artists — one neighbour of the seed artist, nearest first.
 * `artist_id` is resolved from the name through AudioMuse's own media-server
 * registry, so it is null whenever that lookup fails; only `artist` is certain.
 */
export interface AudioMuseSimilarArtist {
  artist: string;
  artist_id?: string | null;
  divergence?: number;
}

/**
 * GET /api/search_artists — reads the analysed-track table rather than the
 * artist index, so it answers on any deployment carrying the artist-similarity
 * blueprint whatever state that index is in. That is exactly what makes it the
 * capability probe.
 */
export interface AudioMuseArtistSearchResult {
  artist: string;
  artist_id?: string | null;
  track_count?: number;
}

/**
 * GET /api/find_path. `total_distance` is the sum over consecutive pairs; there
 * is no per-track distance — AudioMuse's own web UI derives its graphs from the
 * `embedding_vector` each row carries, which this app has no use for.
 */
export interface AudioMusePathResponse {
  path?: AudioMuseTrack[];
  total_distance?: number;
}

/**
 * One cluster of a mood, as GET /api/mood_centroids describes them. AudioMuse
 * ships these precomputed, so they exist on every deployment whatever state its
 * own analysis is in — but the tracks they are matched against do not.
 * `index` is what the similarity endpoint takes as `centroid_index`.
 */
export interface AudioMuseMoodCentroid {
  index: number;
  /** The five tags that dominate the cluster, strongest first. */
  top_tags?: string[];
  n_songs?: number;
  mood_score?: number;
  cluster_id?: number;
}

/** GET /api/mood_centroids — mood name to its clusters. Vectors are omitted. */
export type AudioMuseMoodCentroids = Record<string, AudioMuseMoodCentroid[]>;

/** One saved Alchemy anchor, as GET /api/anchors lists them (centroid omitted). */
export interface AudioMuseAnchor {
  id: number;
  name: string;
}

/**
 * GET /api/anchors. A database failure still answers with an empty `anchors`
 * list alongside an `error`, so the two cases collapse to the same handling.
 */
export interface AudioMuseAnchorsResponse {
  anchors?: AudioMuseAnchor[];
  error?: string;
}

/**
 * GET /api/sem_grove/stats — the *merged lyrics+audio* index the lyrics path
 * space walks. Not the same index as /api/lyrics/stats, which describes the
 * text-search one: a deployment can have that one loaded and this one absent.
 */
export interface AudioMuseSemGroveStats {
  loaded?: boolean;
  song_count?: number;
}

/** GET /api/servers — the media servers this deployment analyses. */
export interface AudioMuseServersResponse {
  servers?: {
    server_id: string;
    name?: string;
    server_type?: string;
    is_default?: boolean;
  }[];
  default_id?: string | null;
  multi_server_enabled?: boolean;
}
