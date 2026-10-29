// Persisted-store coverage lists for backup/restore. Kept in their own module
// with no native imports so the drift guard in
// __tests__/backup.store-coverage.test.ts can import them without pulling in
// react-native-share / MMKV. Every persisted store must appear in one of these
// lists (enforced by that test).

// Globally-scoped persisted stores (one bucket regardless of server/user).
// Every store that persists via `zustandStorage` must be listed here.
export const GLOBAL_KEYS = [
  "auth",
  "servers",
  "app",
  "podcasts",
  "podcastPlayed",
  "musicFolders",
  "radioStations",
] as const;

// Credentials removed from a store's persisted `state` before it goes into a
// backup file, and again when one is restored (so an older file that still
// carries them can't bring them back). No password, token or API key ever
// leaves the device in a backup: restoring routes through a fresh sign-in, and
// each integration asks to be reconnected.
//
// Deleted rather than blanked, so the restored store falls back to its own
// initial value (an env-seeded Taddy key, `isConnected: false`). Connection
// flags are listed alongside the credential they vouch for, or a restored store
// would claim to be connected with no key.
//
// `auth` and `servers` are handled in services/backup.ts itself (the session's
// identity is kept for the re-login prompt; saved passwords and custom header
// values are dropped from nested objects). A drift guard in
// __tests__/backup.store-coverage.test.ts fails when a persisted store gains a
// credential-looking field that isn't listed here.
export const BACKUP_SECRET_FIELDS: Readonly<Record<string, readonly string[]>> =
  {
    podcasts: ["taddyPodcastsApiKey", "taddyPodcastsUserId"],
    listenBrainzStore: ["token"],
    lastFmStore: ["sessionKey", "sessionInvalid"],
    lidarrStore: ["apiKey", "isConnected"],
    soulsyncStore: ["apiKey", "isConnected"],
    tidarrStore: ["apiKey", "isConnected"],
    audioMuseStore: ["apiToken", "isConnected", "fingerprintSecret"],
  };

// Global stores deliberately left out of a backup. A backup leaves the device
// through the share sheet (cloud drives, chat apps, email), and these hold
// standing credentials rather than settings:
// - `oidc`: single-sign-on refresh tokens. A restored SSO server just asks for
//   a fresh sign-in, the same way a restored password server does.
export const BACKUP_EXCLUDED_GLOBAL_KEYS = ["oidc"] as const;

// Persisted stores namespaced per (server, user) via createDynamicScopedStorage
// — their MMKV keys look like `<scope>:<name>` (the queue uses `<scope>:queueStore:*`).
// Used to recover scopes from storage when the `users` list is incomplete, so
// every store that persists via createDynamicScopedStorage must be listed here.
export const SCOPED_STORE_NAMES = [
  "offlineStore",
  "queueStore",
  "playlists",
  "jukeboxStore",
  "upnpStore",
  "activity",
  "playHistory",
  "recentPlays",
  "recentSearches",
  "bookmarks",
  "localLibraryStore",
  "capabilityOverridesStore",
  "offlineMutations",
  "librarySyncStore",
  "lidarrStore",
  "soulsyncStore",
  "tidarrStore",
  "musicBrainzStore",
  "audioMuseStore",
  "listenBrainzStore",
  "lastFmStore",
  "lrclibPicksStore",
  "trackCacheStore",
] as const;

// The ListenBrainz store is deliberately *not* excluded even though it also
// carries a pending queue: unlike the mutations below, a listen is idempotent at
// the destination. ListenBrainz dedupes on (user, listened_at, recording_msid)
// and every queued listen carries the absolute timestamp it was played at, so a
// restored queue draining alongside the original device's is collapsed server
// side rather than double-counted. Its token is stripped (BACKUP_SECRET_FIELDS),
// so the queue drains only once the user reconnects.
//
// The Last.fm store travels for the same reason, with one caveat worth knowing:
// Last.fm dedupes on (user, artist, track, timestamp) rather than on a submission
// id, so a restored queue draining alongside the original device's collapses only
// where the metadata matches exactly. The scrobbler's own 14-day cutoff bounds
// how much of a restored queue can still be submitted at all.
//
// Scoped stores that must NOT travel in a backup file. The first two hold state
// that is only true of the device that wrote it: the offline-mutations queue is
// transient sync state, and restoring it later (or on another device) would
// replay stale actions against the server — duplicating playlist adds or
// deleting a playlist the user has since re-created — possibly after the
// original device already synced them; the library-sync store tracks which
// tracks are on *this* device's filesystem, so restoring it elsewhere would
// report a synced library with nothing actually downloaded. The LRCLIB picks
// store is excluded for a different reason — it carries whole lyrics sheets, so
// it would dominate an export that goes out through the OS share sheet, and a
// lost pick is one tap to redo.
export const BACKUP_EXCLUDED_SCOPED_STORE_NAMES = [
  "offlineMutations",
  "librarySyncStore",
  "lrclibPicksStore",
  // The prefetch cache's index points at files in this device's cache directory
  // — restoring it elsewhere (or later) would claim tracks are cached that
  // aren't, and every entry is re-derivable from the server anyway.
  "trackCacheStore",
  // The React Query cache (`wavio-rq:*` per query, plus the legacy
  // `wavio-rq-cache` blob): server responses, re-fetched on demand, and big
  // enough (tens of MB on a large library) to dominate an export.
  "wavio-rq",
] as const;
