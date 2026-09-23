import {
  type DehydratedState,
  dehydrate,
  hydrate,
  type QueryCacheNotifyEvent,
} from "@tanstack/react-query";
import {
  getIsCacheRestoring,
  queryClient,
  shouldPersistQuery,
  subscribeCacheRestoring,
} from "@/config/queryClient";
import {
  registerPendingFlusher,
  scopedLegacyQueryCacheKey,
  scopedQueryCachePrefix,
  scopedQueryCacheTouchedKey,
  storage,
} from "@/config/storage";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import { logError } from "@/utils/log";

// Persists the React Query cache one query per MMKV key instead of one blob for
// the whole cache. The blob persister dehydrated every query on every cache
// event and re-stringified all of it once a second, so its cost grew with
// everything ever visited — a 38 MB cache took playback from 46 % to 79 % JS
// (issue #205). Here a cache event only marks its query dirty, and a flush
// serializes the dirty queries alone.

type DehydratedQuery = DehydratedState["queries"][number];

const FLUSH_DELAY_MS = 2000;
// A scope whose cache hasn't been restored for this long is dropped whole, like
// the blob persister's maxAge. Counted from the last restore rather than from
// each query's data, so a long stretch offline doesn't expire what the app is
// still living on.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Retired by paging (its key is now ":infinite", never persisted).
const RETIRED_QUERY_ROOTS = new Set(["artistSongs"]);

// The scope whose data the in-memory cache holds: set by a restore, dropped the
// moment the auth scope moves away from it. Keying writes to this rather than to
// the auth scope at event time matters in the gap between a sign-out / server
// switch and the next restore — a late response from the outgoing server, or the
// removals of logout's clear(), must never land in another scope's keys.
let cacheScope: string | null = null;
const pendingWrites = new Set<string>();
const pendingRemoves = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function clearPending(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pendingWrites.clear();
  pendingRemoves.clear();
}

function flush(): void {
  const scope = cacheScope;
  const writes = new Set(pendingWrites);
  const removes = new Set(pendingRemoves);
  clearPending();
  if (scope === null) return;
  const prefix = scopedQueryCachePrefix(scope);
  for (const queryHash of removes) storage.remove(prefix + queryHash);
  if (writes.size === 0) return;
  const { queries } = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      writes.has(query.queryHash) && shouldPersistQuery(query),
    shouldDehydrateMutation: () => false,
  });
  for (const query of queries) {
    storage.set(prefix + query.queryHash, JSON.stringify(query));
    writes.delete(query.queryHash);
  }
  // Still cached but no longer persistable (reset, or a lyrics hit that became
  // a miss). A query that's gone entirely left its own "removed" event.
  for (const queryHash of writes) {
    if (queryClient.getQueryCache().get(queryHash)) {
      storage.remove(prefix + queryHash);
    }
  }
}

function onCacheEvent(event: QueryCacheNotifyEvent): void {
  // Hydration runs under this flag and must not be written straight back.
  if (cacheScope === null || getIsCacheRestoring()) return;
  const isRemoval = event.type === "removed";
  const isDataChange =
    event.type === "updated" &&
    (event.action.type === "success" || event.action.type === "setState");
  if (!isRemoval && !isDataChange) return;
  const { queryHash } = event.query;
  if (isRemoval) {
    pendingWrites.delete(queryHash);
    pendingRemoves.add(queryHash);
  } else {
    pendingRemoves.delete(queryHash);
    pendingWrites.add(queryHash);
  }
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

export function subscribeQueryPersistence(): () => void {
  const unsubscribeCache = queryClient.getQueryCache().subscribe(onCacheEvent);
  // The auth store flips before logout / a server switch clears the cache, so
  // the outgoing scope's pending writes still find their own data here.
  const unsubscribeAuth = useAuthBase.subscribe(() => {
    if (cacheScope === null || cacheScope === currentAuthScope()) return;
    flush();
    cacheScope = null;
  });
  // A same-scope re-restore doesn't flip the auth scope; flush before it runs.
  const unsubscribeRestoring = subscribeCacheRestoring(() => {
    if (getIsCacheRestoring()) flush();
  });
  const unregisterFlusher = registerPendingFlusher(flush);
  return () => {
    flush();
    unsubscribeCache();
    unsubscribeAuth();
    unsubscribeRestoring();
    unregisterFlusher();
  };
}

function parseQuery(raw: string | undefined): DehydratedQuery | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DehydratedQuery;
  } catch {
    return null;
  }
}

function scopeKeys(scope: string): string[] {
  const prefix = scopedQueryCachePrefix(scope);
  return storage.getAllKeys().filter((key) => key.startsWith(prefix));
}

function migrateLegacyBlob(scope: string, now: number): void {
  const legacyKey = scopedLegacyQueryCacheKey(scope);
  const raw = storage.getString(legacyKey);
  if (raw === undefined) return;
  try {
    const blob = JSON.parse(raw) as {
      timestamp?: number;
      clientState?: DehydratedState;
    };
    if (now - (blob.timestamp ?? 0) <= MAX_AGE_MS) {
      const prefix = scopedQueryCachePrefix(scope);
      for (const query of blob.clientState?.queries ?? []) {
        if (RETIRED_QUERY_ROOTS.has(String(query.queryKey[0]))) continue;
        storage.set(prefix + query.queryHash, JSON.stringify(query));
      }
    }
  } catch (error) {
    logError("[queryPersister] Dropping unreadable legacy cache", error);
  }
  storage.remove(legacyKey);
}

// Hydrates the active scope's persisted queries. Run under the
// setCacheRestoring(true/false) bracket, so hydration isn't written back.
export function restorePersistedQueries(): void {
  const scope = currentAuthScope();
  const now = Date.now();
  migrateLegacyBlob(scope, now);
  const touchedKey = scopedQueryCacheTouchedKey(scope);
  const touched = storage.getNumber(touchedKey);
  const expired = touched !== undefined && now - touched > MAX_AGE_MS;
  const queries: DehydratedQuery[] = [];
  for (const key of scopeKeys(scope)) {
    const query = expired ? null : parseQuery(storage.getString(key));
    if (query) queries.push(query);
    else storage.remove(key);
  }
  storage.set(touchedKey, now);
  cacheScope = scope;
  hydrate(queryClient, { mutations: [], queries });
}

// Deletes the active scope's persisted cache (Settings → clear cache, the
// Navidrome id migration). Call after queryClient.clear().
export function removePersistedQueries(): void {
  const scope = currentAuthScope();
  if (cacheScope === scope) clearPending();
  for (const key of scopeKeys(scope)) storage.remove(key);
  storage.remove(scopedLegacyQueryCacheKey(scope));
}

// Character count (≈ bytes) of the active scope's persisted cache, for the
// storage overview in settings.
export function getPersistedCacheSize(): number {
  const scope = currentAuthScope();
  if (cacheScope === scope) flush();
  let size = 0;
  for (const key of scopeKeys(scope)) {
    size += storage.getString(key)?.length ?? 0;
  }
  return size;
}
