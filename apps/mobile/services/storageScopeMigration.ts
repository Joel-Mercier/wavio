import { Directory, File, Paths } from "expo-file-system";
import { getAuthScope } from "@/config/authScope";
import { storage } from "@/config/storage";
import { SCOPED_STORE_NAMES } from "@/services/backupStoreKeys";
import { reportError } from "@/services/errorReporting";
import { useAuthBase } from "@/stores/auth";
import { useMusicFoldersBase } from "@/stores/musicFolders";
import { usePodcastsBase } from "@/stores/podcasts";
import { useRadioStationsBase } from "@/stores/radioStations";
import type { Server, ServerUser } from "@/stores/servers";

// One-shot migration of every per-(server, user) storage bucket from the legacy
// URL-derived scope to the id-derived one (see config/storage.ts).
//
// The URL used to be part of a session's identity, so changing it — editing the
// server, or failing over to a fallback address — silently orphaned that
// account's queue, downloads and cache. Keying on the server's stable id fixes
// that, but every already-installed app has data sitting under the old keys, so
// it has to be moved exactly once.
//
// Everything here is synchronous (MMKV and the file system's moveSync all are)
// because it must complete before the scoped stores hydrate — see
// runStorageScopeMigration.
//
// Failure mode is deliberately "orphan, never destroy": new keys are written
// before old ones are removed, every step is idempotent, and the sentinel is
// only written once all steps succeed. A partial run is re-tried on next launch.

// Not bumped when migrateLocalLibraryDatabases was added: this migration has
// never been released, so no install has a half-migrated layout to rescue. Only
// bump it for a layout change that shipped — and note that a re-run cannot
// recover a database orphaned by an earlier run, because db.ts will have created
// an empty one at the new scope in the meantime and the move below (rightly)
// won't clobber it.
const SENTINEL_KEY = "storageScopeMigration:v2";

const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "_");

// The pre-migration scope formula. Frozen here on purpose: it must keep
// describing the *old* layout even as getAuthScope evolves, or already-migrated
// installs would stop being recognisable.
export const legacyAuthScope = (url: string, username: string) =>
  `${sanitize(url)}_${sanitize(username)}`;

/** old scope -> new scope, for scopes that actually change. */
export type ScopeRemap = Map<string, string>;

type PersistedServers = {
  state?: { servers?: Server[]; users?: ServerUser[] };
};

function readJson<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Every scope that currently owns data in storage. Mirrors the recovery scan in
// services/backup.ts: a scoped key is `<scope>:<storeName>` and a scope can
// never contain ":", so the scope is the slice before the first store marker.
function scopesPresentInStorage(): Set<string> {
  const found = new Set<string>();
  for (const key of storage.getAllKeys()) {
    for (const name of SCOPED_STORE_NAMES) {
      const idx = key.indexOf(`:${name}`);
      if (idx > 0) {
        found.add(key.slice(0, idx));
        break;
      }
    }
  }
  return found;
}

/**
 * Build the old -> new scope mapping from a persisted `servers` blob.
 *
 * Exported so services/backup.ts can apply the same remap to a v1 backup file,
 * which carries its own copy of the servers store.
 */
export function buildScopeRemap(
  serversRaw: string | undefined | null,
  // Scopes that own data. Defaults to what's in live storage; the backup
  // restore path passes the scopes carried by the file instead.
  presentScopes: Iterable<string> = scopesPresentInStorage(),
) {
  const parsed = readJson<PersistedServers>(serversRaw);
  const servers = parsed?.state?.servers ?? [];
  const users = parsed?.state?.users ?? [];
  const remap: ScopeRemap = new Map();
  // Local libraries keep the historical `local_local` sentinel (see
  // LOCAL_AUTH_SCOPE), so they need no remapping at all.
  const remoteServers = servers.filter((s) => s?.type !== "local" && s?.id);
  const serverById = new Map(remoteServers.map((s) => [s.id, s] as const));

  // Exact mapping for every known (server, user) pair.
  for (const user of users) {
    const server = serverById.get(user?.serverId);
    if (!server || !user?.username) continue;
    const from = legacyAuthScope(server.url, user.username);
    const to = getAuthScope(server.id, user.username);
    if (from !== to) remap.set(from, to);
  }

  // Recovery for scopes whose user is no longer in the `users` list (legacy
  // state, removed users). The username can't be looked up, but it's the
  // already-sanitized remainder after the server's URL prefix — and sanitizing
  // is idempotent, so it can be reused verbatim.
  //
  // Longest URL prefix wins: with both `https://x.com` and `https://x.com:4533`
  // saved, the scope `https___x_com_4533_alice` is ambiguous, and the longer
  // match is the correct reading.
  const byPrefixLength = [...remoteServers].sort(
    (a, b) => b.url.length - a.url.length,
  );
  for (const scope of presentScopes) {
    if (remap.has(scope)) continue;
    for (const server of byPrefixLength) {
      const prefix = `${sanitize(server.url)}_`;
      if (!scope.startsWith(prefix)) continue;
      const usernamePart = scope.slice(prefix.length);
      if (!usernamePart) break;
      const to = `${sanitize(server.id)}_${usernamePart}`;
      if (scope !== to) remap.set(scope, to);
      break;
    }
  }

  return remap;
}

// Move every `<oldScope>:*` key to `<newScope>:*`.
//
// Prefix-based rather than a loop over SCOPED_STORE_NAMES on purpose: it also
// carries the queue's three hand-rolled keys (`<scope>:queueStore:queue`, and
// the shuffleOrder/cursor siblings) and the React Query cache
// (`<scope>:wavio-rq-cache`) without either having to be enumerated here.
function renameScopedKeys(remap: ScopeRemap): void {
  for (const key of storage.getAllKeys()) {
    const idx = key.indexOf(":");
    if (idx <= 0) continue;
    const to = remap.get(key.slice(0, idx));
    if (!to) continue;
    const newKey = `${to}${key.slice(idx)}`;
    const value = storage.getString(key);
    if (value === undefined || value === null) continue;
    // Write-then-remove: an interrupted run leaves the old copy readable.
    storage.set(newKey, value);
    storage.remove(key);
  }
}

// Rewrite scope strings that live *inside* a global store's JSON rather than in
// its key. `mutate` returns null when nothing changed, so an already-migrated
// install doesn't rewrite the blob.
//
// These stores hydrate at import (no skipHydration), so their in-memory copy is
// already live by the time this runs. Writing raw MMKV underneath them would be
// undone by the next persist, so callers apply the result via the store's own
// setState — see applyGlobalStoreRewrites.
function rewriteGlobalBlob(
  key: string,
  mutate: (state: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  const parsed = readJson<{ state?: Record<string, unknown> }>(
    storage.getString(key),
  );
  const state = parsed?.state;
  if (!state) return null;
  return mutate(state) ? state : null;
}

/** musicFolders keys its `selections` map by scope. */
export function remapMusicFolderSelections(
  remap: ScopeRemap,
): Record<string, unknown> | null {
  return rewriteGlobalBlob("musicFolders", (state) => {
    const selections = state.selections as
      | Record<string, string | undefined>
      | undefined;
    if (!selections) return false;
    let changed = false;
    const next: Record<string, string | undefined> = {};
    for (const [scope, value] of Object.entries(selections)) {
      const to = remap.get(scope);
      if (to) changed = true;
      next[to ?? scope] = value;
    }
    if (!changed) return false;
    state.selections = next;
    return true;
  });
}

/**
 * podcasts / radioStations tag each "server" favorite with the scope it came
 * from and filter on it by equality (podcastFavoritesForScope /
 * radioFavoritesForScope). Miss these and every server favorite silently
 * disappears from the UI while still sitting in storage.
 */
export function remapFavoriteScopes(
  remap: ScopeRemap,
  storeKey: "podcasts" | "radioStations",
  field: "favoritePodcasts" | "favoriteRadioStations",
): Record<string, unknown> | null {
  return rewriteGlobalBlob(storeKey, (state) => {
    const favorites = state[field] as Array<{ scope?: string }> | undefined;
    if (!Array.isArray(favorites)) return false;
    let changed = false;
    for (const fav of favorites) {
      if (!fav?.scope) continue;
      const to = remap.get(fav.scope);
      if (!to) continue;
      fav.scope = to;
      changed = true;
    }
    return changed;
  });
}

/**
 * Move `<documents>/offline/<oldScope>` and rewrite the absolute paths the
 * offline store persists for each downloaded track.
 *
 * Both halves or neither: `OfflineTrack.path` is a full file:// URI, so moving
 * the directory without rewriting the paths would leave every downloaded track
 * pointing at a file that no longer exists — and clearAllDownloads would then
 * delete only the new directory, orphaning the bytes for good.
 */
export function migrateOfflineDownloads(remap: ScopeRemap): void {
  for (const [from, to] of remap) {
    const fromDir = new Directory(Paths.document, "offline", from);
    if (fromDir.exists) {
      const toDir = new Directory(Paths.document, "offline", to);
      // A previous interrupted run may already have moved it.
      if (!toDir.exists) fromDir.moveSync(toDir);
    }
    rewriteOfflineTrackPaths(from, to);
  }
}

/**
 * Repoint the absolute `file://` paths inside a serialized offlineStore blob
 * from one scope's download directory to another's. Returns null when nothing
 * changed, so callers can skip the write.
 *
 * Shared with services/backup.ts: a v1 backup carries paths under the old scope
 * too, and it's restored after the directory has already moved.
 */
export function remapOfflineTrackPaths(
  raw: string | undefined | null,
  from: string,
  to: string,
): string | null {
  const parsed = readJson<{ state?: { downloadedTracks?: unknown } }>(raw);
  const tracks = parsed?.state?.downloadedTracks as
    | Record<string, { path?: string }>
    | undefined;
  if (!tracks) return null;
  const fromSegment = `/offline/${from}/`;
  const toSegment = `/offline/${to}/`;
  let changed = false;
  for (const track of Object.values(tracks)) {
    if (typeof track?.path !== "string") continue;
    if (!track.path.includes(fromSegment)) continue;
    track.path = track.path.replace(fromSegment, toSegment);
    changed = true;
  }
  return changed ? JSON.stringify(parsed) : null;
}

function rewriteOfflineTrackPaths(from: string, to: string): void {
  // Read from the *new* key: renameScopedKeys has already run.
  const key = `${to}:offlineStore`;
  const next = remapOfflineTrackPaths(storage.getString(key), from, to);
  if (next) storage.set(key, next);
}

/**
 * Move the per-scope SQLite index (`local-library-<scope>.db`, see
 * services/local/db.ts) onto the new scope.
 *
 * That database is not just the local library's: it also backs the on-device
 * podcast store that Navidrome and Jellyfin fall back to, since neither serves
 * the Subsonic podcast section (see services/backend/podcasts.ts). So a *remote*
 * server's database is scope-keyed too and has to follow the rename like every
 * other bucket — leaving it behind makes db.ts open a new, empty file, and
 * useSyncServerPodcastFavorites then reads that emptiness as "the channels were
 * deleted on the server" and prunes the favorites for good.
 *
 * The sidecars move first so the `.db` lands last: it's what db.ts opens, so an
 * interrupted run is retried while the old file is still the complete one. WAL
 * carries committed-but-un-checkpointed transactions, so it has to travel with
 * the database; `-shm` is rebuildable but is moved rather than orphaned.
 */
export function migrateLocalLibraryDatabases(remap: ScopeRemap): void {
  const sqliteDir = new Directory(Paths.document, "SQLite");
  if (!sqliteDir.exists) return;
  for (const [from, to] of remap) {
    for (const suffix of ["-wal", "-shm", ""]) {
      const fromFile = new File(sqliteDir, `local-library-${from}.db${suffix}`);
      if (!fromFile.exists) continue;
      const toFile = new File(sqliteDir, `local-library-${to}.db${suffix}`);
      // A previous interrupted run may already have moved it.
      if (toFile.exists) continue;
      fromFile.moveSync(toFile);
    }
  }
}

export function hasRunStorageScopeMigration(): boolean {
  return !!storage.getString(SENTINEL_KEY);
}

/**
 * Pure storage half of the migration. Returns the rewritten global-store states
 * so the caller can push them through the live stores (see
 * runStorageScopeMigration), plus the remap for the auth back-fill.
 */
export function migrateStorageScopes(): {
  remap: ScopeRemap;
  musicFolders: Record<string, unknown> | null;
  podcasts: Record<string, unknown> | null;
  radioStations: Record<string, unknown> | null;
} {
  const remap = buildScopeRemap(storage.getString("servers"));
  if (remap.size === 0) {
    return { remap, musicFolders: null, podcasts: null, radioStations: null };
  }
  // Order matters: the key rename has to land before the offline paths are
  // rewritten, since that reads the store back from its new key.
  renameScopedKeys(remap);
  const musicFolders = remapMusicFolderSelections(remap);
  const podcasts = remapFavoriteScopes(remap, "podcasts", "favoritePodcasts");
  const radioStations = remapFavoriteScopes(
    remap,
    "radioStations",
    "favoriteRadioStations",
  );
  migrateOfflineDownloads(remap);
  migrateLocalLibraryDatabases(remap);
  return { remap, musicFolders, podcasts, radioStations };
}

/**
 * Resolve the `serverId` the auth store gained in v4 from the URL the session
 * was signed in with. Can't be done in the store's persist `migrate` — that
 * needs the servers store, whose rehydration order relative to auth isn't
 * guaranteed.
 */
export function resolveAuthServerId(
  url: string,
  serversRaw: string | undefined | null,
): string | null {
  if (!url) return null;
  const parsed = readJson<PersistedServers>(serversRaw);
  const servers = parsed?.state?.servers ?? [];
  const trimmed = url.trim();
  const match =
    servers.find((s) => s?.url === trimmed) ??
    // The local library signs in with the fixed `local` sentinel URL.
    (trimmed === "local"
      ? servers.find((s) => s?.type === "local")
      : undefined);
  return match?.id ?? null;
}

/**
 * Run the scope migration exactly once, before anything reads scoped state.
 *
 * MUST be called synchronously at the app root, before the (app) layout's
 * hydration effect: the scoped stores use `skipHydration` and are rehydrated
 * there, and hydrating them ahead of the rename would read the new (empty)
 * buckets and then persist those defaults over the un-migrated data.
 *
 * The global stores (auth, musicFolders, podcasts, radioStations) hydrate at
 * import, so their rewrites are pushed through setState rather than written
 * under them in MMKV — a raw write would be clobbered by the next persist.
 */
export function runStorageScopeMigration(): void {
  if (hasRunStorageScopeMigration()) return;
  try {
    const serversRaw = storage.getString("servers");
    // A `servers` blob that exists but won't parse means we can't build the
    // remap. Bail WITHOUT the sentinel so the next launch retries, rather than
    // marking the migration done and orphaning this install's data forever.
    if (serversRaw && readJson<PersistedServers>(serversRaw) === null) {
      reportError(new Error("servers blob unparseable"), {
        area: "storage",
        endpoint: "storage scope migration",
      });
      return;
    }

    const { musicFolders, podcasts, radioStations } = migrateStorageScopes();
    if (musicFolders) useMusicFoldersBase.setState(musicFolders);
    if (podcasts) usePodcastsBase.setState(podcasts);
    if (radioStations) useRadioStationsBase.setState(radioStations);

    const auth = useAuthBase.getState();
    if (auth.isAuthenticated && !auth.serverId) {
      const serverId = resolveAuthServerId(auth.url, serversRaw);
      // No matching server row means this session can't be scoped. Signing out
      // is the honest outcome: it costs a re-login, where a signed-in session
      // pointed at scope "_<username>" would quietly share a bucket with every
      // other unresolvable session.
      if (serverId) useAuthBase.setState({ serverId });
      else useAuthBase.getState().logout();
    }

    storage.set(SENTINEL_KEY, new Date().toISOString());
  } catch (err) {
    // No sentinel: the next launch retries. Every step is idempotent and writes
    // the new copy before removing the old, so a partial run is recoverable.
    reportError(err, { area: "storage", endpoint: "storage scope migration" });
  }
}
