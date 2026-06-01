import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  defaultShouldDehydrateQuery,
  type Query,
  QueryClient,
} from "@tanstack/react-query";
import {
  getAuthScope,
  QUERY_CACHE_KEY,
  scopedQueryCacheKey,
  storage,
} from "@/config/storage";
import { useAuthBase } from "@/stores/auth";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 5 min: persisted entries restore instantly but are
      // considered stale on mount, so React Query refetches in the background
      // while online (stale-while-revalidate) and server changes surface fast.
      staleTime: 5 * 60 * 1000,
      // Raised so cache entries survive long enough to be persisted/restored
      // across cold starts (was 30 min).
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

// Resolve the active (server, user) scope at call time. The persisted cache is
// stored under `${scope}:wavio-rq-cache`, mirroring the zustand stores'
// per-scope namespacing (createDynamicScopedStorage). The persister uses a
// single logical key; this adapter routes it to the current scope's bucket.
function currentScope(): string {
  const { url, username } = useAuthBase.getState();
  return getAuthScope(url, username);
}

// MMKV is synchronous, but the async persister keeps cache reads/writes off the
// critical render path (createAsyncStoragePersister awaits these). We wrap the
// synchronous MMKV calls in resolved promises.
const mmkvQueryPersisterStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(storage.getString(`${currentScope()}:${key}`) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    storage.set(`${currentScope()}:${key}`, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    storage.remove(`${currentScope()}:${key}`);
    return Promise.resolve();
  },
};

export const queryPersister = createAsyncStoragePersister({
  storage: mmkvQueryPersisterStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1000,
});

export const persistOptions = {
  persister: queryPersister,
  // Discard persisted cache older than 7 days.
  maxAge: 7 * 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      defaultShouldDehydrateQuery(query) &&
      // Infinite-list pages don't restore cleanly; skip them.
      !String(query.queryKey[0]).includes(":infinite"),
  },
} as const;

// Byte length (UTF-8 approx) of the current scope's persisted cache blob — used
// by the storage overview in settings.
export function getPersistedCacheSize(): number {
  const raw = storage.getString(scopedQueryCacheKey(currentScope()));
  return raw ? raw.length : 0;
}

// Tracks whether the persisted cache is currently being restored (initial load
// or a server switch). The offline-greying hook treats "restoring" as
// online-equivalent so it never briefly greys everything while the cache is
// still being hydrated. Starts true: the first restore runs on app start.
let cacheRestoring = true;
const restoringListeners = new Set<() => void>();

export function getIsCacheRestoring(): boolean {
  return cacheRestoring;
}

export function subscribeCacheRestoring(cb: () => void): () => void {
  restoringListeners.add(cb);
  return () => {
    restoringListeners.delete(cb);
  };
}

export function setCacheRestoring(value: boolean): void {
  if (value === cacheRestoring) return;
  cacheRestoring = value;
  for (const cb of restoringListeners) cb();
}
