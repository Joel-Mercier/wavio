// Scope-key derivation, kept free of native imports (no MMKV) so tests and the
// pure helpers in services/storageScopeMigration.ts can use the real thing
// instead of reimplementing the formula. Same rationale as
// services/backupStoreKeys.ts.

// Partition key for every piece of per-(server, user) persisted state: the
// scoped zustand stores, the React Query cache, the offline download directory
// and the local library's SQLite file.
//
// Keyed on the server's *id*, never its URL. A URL is a route, not an identity
// — it can change (the user edits it, or failover swaps to a fallback address)
// without the session becoming a different account. Keying on it used to mean
// any URL change silently orphaned that server's queue, downloads and cache.
//
// Callers should prefer `currentAuthScope()` (stores/auth.ts) over building this
// from the store themselves. Sanitizing keeps the result usable as both a
// filename fragment and an MMKV key prefix — services/backup.ts relies on a
// scope never containing ":".
export const getAuthScope = (serverId: string, username: string) => {
  const safeServerId = serverId.replace(/[^a-zA-Z0-9]/g, "_");
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeServerId}_${safeUsername}`;
};

// The on-device library is a singleton (one server row, one user, no URL), so an
// id buys it nothing and its scope can never collide. Keeping the historical
// sentinel means local users need no storage migration at all.
export const LOCAL_AUTH_SCOPE = "local_local";
