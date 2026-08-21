// Wire shapes for the ListenBrainz API. Field names are the API's, not the
// app's, so they are snake_case throughout.
// https://listenbrainz.readthedocs.io/en/latest/users/api/core.html

export type ListenAdditionalInfo = {
  recording_mbid?: string;
  release_mbid?: string;
  artist_mbids?: string[];
  duration_ms?: number;
  tracknumber?: string;
  media_player?: string;
  submission_client?: string;
  submission_client_version?: string;
  music_service_name?: string;
};

export type ListenTrackMetadata = {
  // The only two required fields; both must be plain strings.
  artist_name: string;
  track_name: string;
  release_name?: string;
  additional_info?: ListenAdditionalInfo;
};

export type Listen = {
  // Unix seconds. Required for "single"/"import", and must be ABSENT for
  // "playing_now" — the API rejects a payload that carries it.
  listened_at?: number;
  track_metadata: ListenTrackMetadata;
};

export type ListenSubmission = {
  listen_type: "single" | "playing_now" | "import";
  payload: Listen[];
};

// validate-token answers 200 even for a bad token, so `valid` is the only
// signal that matters — never branch on the status code here.
export type ValidateTokenResponse = {
  code: number;
  message: string;
  valid: boolean;
  user_name?: string;
};

// --- Statistics -------------------------------------------------------------
// https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html
//
// The API accepts nine ranges; these are the four the app exposes.
export type StatsRange = "week" | "month" | "year" | "all_time";

// Every stats payload carries these. `last_updated` is unix seconds and is the
// only honest answer to "how fresh is this?" — the figures are recomputed by a
// batch job roughly daily, not on read.
type StatsPayloadBase = {
  last_updated: number;
  user_id: string;
  from_ts: number;
  to_ts: number;
  range?: string;
};

// Cover Art Archive coordinates. Returned by the releases and recordings
// endpoints but ABSENT from the documented schema, so they are treated as
// optional everywhere and their loss degrades to placeholder art.
type CoverArtFields = {
  caa_id?: number;
  caa_release_mbid?: string;
};

export type TopArtist = {
  artist_mbid?: string;
  artist_name: string;
  listen_count: number;
};

export type TopRelease = CoverArtFields & {
  artist_mbids?: string[];
  artist_name: string;
  listen_count: number;
  release_mbid?: string;
  release_name: string;
};

export type TopRecording = CoverArtFields & {
  artist_mbids?: string[];
  artist_name: string;
  listen_count: number;
  recording_mbid?: string;
  release_mbid?: string;
  release_name?: string;
  track_name: string;
};

// The three "top" endpoints are paginated: `count`/`offset` describe the slice
// returned, `total_*_count` the whole list. The app only ever asks for the
// first page, so only the rows themselves are read.
export type TopArtistsPayload = StatsPayloadBase & {
  artists: TopArtist[];
  count: number;
  offset?: number;
  total_artist_count: number;
};

export type TopReleasesPayload = StatsPayloadBase & {
  releases: TopRelease[];
  count: number;
  offset?: number;
  total_release_count: number;
};

export type TopRecordingsPayload = StatsPayloadBase & {
  recordings: TopRecording[];
  count: number;
  offset?: number;
  total_recording_count: number;
};

// `time_range` is a display label whose meaning follows the requested range —
// a weekday name, a month, a year — so it is passed through rather than parsed.
export type ListeningActivityEntry = {
  from_ts: number;
  listen_count: number;
  time_range: string;
  to_ts: number;
};

export type ListeningActivityPayload = StatsPayloadBase & {
  listening_activity: ListeningActivityEntry[];
};

export type DailyActivityEntry = {
  hour: number;
  listen_count: number;
};

// Keyed by full English weekday name ("Monday"…), 24 hourly entries each.
// Hours are UTC: the API offers no timezone parameter and states it assumes
// every listen is UTC, which the UI has to disclose rather than silently shift.
export type DailyActivityPayload = StatsPayloadBase & {
  daily_activity: Record<string, DailyActivityEntry[] | undefined>;
};

// Release year of what was listened to, not when it was listened to — this is
// the "music by decade" statistic. Only years with listens are returned, and
// they can reach back to the 1910s.
export type EraActivityEntry = {
  year: number;
  listen_count: number;
};

export type EraActivityPayload = StatsPayloadBase & {
  era_activity: EraActivityEntry[];
};

// Sparse: one entry per (genre, hour) pair that has listens, so a genre nobody
// plays at 4am simply has no row for hour 4. Genre names come from MusicBrainz
// and are always English — there is nothing to translate them against.
export type GenreActivityEntry = {
  genre: string;
  hour: number;
  listen_count: number;
};

export type GenreActivityPayload = StatsPayloadBase & {
  genre_activity: GenreActivityEntry[];
};

// Where the artists you listen to are from. `country` is ISO 3166-1 alpha-3,
// which needs converting before any platform API will name it (utils/countries).
export type ArtistMapEntry = {
  country: string;
  artist_count: number;
  listen_count: number;
  artists?: {
    artist_mbid?: string;
    artist_name: string;
    listen_count: number;
  }[];
};

export type ArtistMapPayload = StatsPayloadBase & {
  artist_map: ArtistMapEntry[];
};

// Your top artists over time. `time_unit` is a *label*, and which kind depends
// on the range: a weekday name for `week`, a day-of-month number for `month`, a
// month name for `year`, a year for `all_time`. Sparse and unordered, so it has
// to be parsed against the range rather than trusted as it arrives.
export type ArtistEvolutionEntry = {
  artist_mbid?: string;
  artist_name: string;
  listen_count: number;
  time_unit: string;
};

export type ArtistEvolutionPayload = StatsPayloadBase & {
  artist_evolution_activity: ArtistEvolutionEntry[];
};

export type StatsResponse<T> = { payload: T };

export type ListenCountPayload = { count: number };

// --- Playlists (JSPF) -------------------------------------------------------
// https://listenbrainz.readthedocs.io/en/latest/users/api/playlist.html
//
// ListenBrainz speaks JSPF, whose extension points are keyed by a URI rather
// than a name — hence the two constants below and the Record<string, …> lookups.

export const JSPF_PLAYLIST_EXT = "https://musicbrainz.org/doc/jspf#playlist";
export const JSPF_TRACK_EXT = "https://musicbrainz.org/doc/jspf#track";

export type JspfTrackExtension = {
  added_at?: string;
  added_by?: string;
  artist_identifiers?: string[];
  additional_metadata?: {
    artists?: {
      artist_credit_name?: string;
      artist_mbid?: string;
      join_phrase?: string;
    }[];
    caa_id?: number;
    caa_release_mbid?: string;
  };
};

export type JspfTrack = {
  title?: string;
  // The artist credit as one string. `additional_metadata.artists` carries the
  // same thing split into parts, which is what we actually prefer.
  creator?: string;
  album?: string;
  // Already milliseconds — JSPF's unit. Do not convert.
  duration?: number;
  // Current builds emit an array of URIs; older ones emitted a bare string.
  identifier?: string | string[];
  extension?: Record<string, JspfTrackExtension | undefined>;
};

export type JspfPlaylistExtension = {
  public?: boolean;
  creator?: string;
  created_for?: string;
  last_modified_at?: string;
  collaborators?: string[];
  additional_metadata?: {
    algorithm_metadata?: { source_patch?: string };
    expires_at?: string;
  };
};

export type JspfPlaylist = {
  annotation?: string;
  creator?: string;
  date?: string;
  identifier?: string | string[];
  title?: string;
  track?: JspfTrack[];
  extension?: Record<string, JspfPlaylistExtension | undefined>;
};

export type CreatedForResponse = {
  count?: number;
  offset?: number;
  playlist_count?: number;
  playlists?: { playlist?: JspfPlaylist }[];
};

export type PlaylistResponse = { playlist?: JspfPlaylist };

// --- App-facing playlist shapes ---------------------------------------------

/**
 * Which generator produced a playlist.
 *
 * ListenBrainz creates many kinds of playlist "for" a user — the yearly
 * top-discoveries/top-missed sets among them — and names the generator in
 * `algorithm_metadata.source_patch`. These three are the recurring ones the app
 * surfaces; everything else is ignored rather than rendered under a title the
 * app has no translation for.
 */
export type CreatedForPatch =
  | "daily-jams"
  | "weekly-jams"
  | "weekly-exploration";

export type ListenBrainzPlaylistSummary = {
  mbid: string;
  patch: CreatedForPatch;
  /** JSPF `date` — when the generator ran. */
  createdAt: string | null;
  expiresAt: string | null;
};

export type ListenBrainzPlaylistTrack = {
  /** Stable list key: the recording MBID when there is one, else position-based. */
  key: string;
  title: string;
  /** The full artist credit ("A feat. B") — for display and downloader queries. */
  artist: string;
  /** Just the first credited artist — libraries rarely tag the full credit. */
  primaryArtist: string;
  album?: string;
  durationMs?: number;
  recordingMbid?: string;
  artistMbids: string[];
  coverArtUrl?: string;
};
