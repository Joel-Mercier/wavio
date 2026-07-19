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
  "musicFolders",
  "radioStations",
] as const;

// Persisted stores namespaced per (server, user) via createDynamicScopedStorage
// — their MMKV keys look like `<scope>:<name>` (the queue uses `<scope>:queueStore:*`).
// Used to recover scopes from storage when the `users` list is incomplete, so
// every store that persists via createDynamicScopedStorage must be listed here.
export const SCOPED_STORE_NAMES = [
  "offlineStore",
  "queueStore",
  "playlists",
  "jukeboxStore",
  "activity",
  "playHistory",
  "recentPlays",
  "recentSearches",
  "bookmarks",
  "localLibraryStore",
  "capabilityOverridesStore",
  "offlineMutations",
  "lidarrStore",
] as const;

// Scoped stores that must NOT travel in a backup file. The offline-mutations
// queue is transient sync state: restoring it later (or on another device)
// would replay stale actions against the server — duplicating playlist adds or
// deleting a playlist the user has since re-created — possibly after the
// original device already synced them.
export const BACKUP_EXCLUDED_SCOPED_STORE_NAMES = ["offlineMutations"] as const;
