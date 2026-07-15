import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  defaultShouldDehydrateQuery,
  MutationCache,
  type Query,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import {
  QUERY_CACHE_KEY,
  scopedQueryCacheKey,
  storage,
} from "@/config/storage";
import { type ReportBackend, reportError } from "@/services/errorReporting";
import { currentAuthScope, useAuthBase } from "@/stores/auth";

// Map the active server type to the reporting backend tag. Navidrome and
// OpenSubsonic both speak Subsonic, so they share the `subsonic` tag.
function activeBackend(): ReportBackend {
  const { serverType } = useAuthBase.getState();
  if (serverType === "jellyfin") return "jellyfin";
  if (serverType === "local") return "local";
  return "subsonic";
}

export const queryClient = new QueryClient({
  // Safety net: any query/mutation failure not already reported at its service
  // chokepoint is reported here, tagged by the active backend. The classifier
  // (and reportError's dedupe) drop offline noise and already-reported errors,
  // so this only fires for genuinely-unreported failures.
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportError(error, {
        area: "api",
        backend: activeBackend(),
        endpoint: String(query.queryKey[0] ?? "query"),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportError(error, {
        area: "api",
        backend: activeBackend(),
        endpoint: mutation.options.mutationKey
          ? String(mutation.options.mutationKey[0])
          : "mutation",
      });
    },
  }),
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

// MMKV is synchronous, but the async persister keeps cache reads/writes off the
// critical render path (createAsyncStoragePersister awaits these). We wrap the
// synchronous MMKV calls in resolved promises.
//
// The scope is resolved at call time (see currentAuthScope): the persisted cache
// lives under `${scope}:wavio-rq-cache`, mirroring the zustand stores' per-scope
// namespacing. The persister uses a single logical key; this adapter routes it
// to the current scope's bucket.
const mmkvQueryPersisterStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(storage.getString(`${currentAuthScope()}:${key}`) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    storage.set(`${currentAuthScope()}:${key}`, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    storage.remove(`${currentAuthScope()}:${key}`);
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
  const raw = storage.getString(scopedQueryCacheKey(currentAuthScope()));
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
