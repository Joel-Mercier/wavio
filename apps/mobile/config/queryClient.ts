import {
  defaultShouldDehydrateQuery,
  MutationCache,
  type Query,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { hasNetworkServerType } from "@/services/backend/serverTraits";
import {
  isNetworkNoise,
  type ReportBackend,
  reportError,
} from "@/services/errorReporting";
import { useAuthBase } from "@/stores/auth";

// Map the active server type to the reporting backend tag. Navidrome and
// OpenSubsonic both speak Subsonic, so they share the `subsonic` tag.
function activeBackend(): ReportBackend {
  const { serverType } = useAuthBase.getState();
  if (serverType === "jellyfin") return "jellyfin";
  if (serverType === "local") return "local";
  if (serverType === "webdav") return "webdav";
  if (serverType === "smb") return "smb";
  return "subsonic";
}

// A connectivity-class query failure (a gateway 502/503/504, an origin-error
// 5xx, or a socket-level error with no response) means the server is
// unreachable, not that the app hit a bug — but the reachability probe runs on
// its own cadence and may not have noticed yet. Kick a probe so serverReachable
// flips within a couple of seconds (offline banner + paused queries + cache)
// instead of waiting for the next heartbeat. Lazy require mirrors
// errorReporting.ts: keep the network / backend-dispatch module graph out of
// queryClient's eval path.
function kickReachabilityProbeIfUnreachable(networkNoise: boolean): void {
  if (!networkNoise) return;
  if (!hasNetworkServerType(useAuthBase.getState().serverType)) return;
  void (
    require("@/services/network") as typeof import("@/services/network")
  ).probeServer();
}

// The grouping key for a query that failed without being reported at its
// service chokepoint. The first segment alone is too coarse: every Navidrome
// native-API query shares the prefix "nd", so they all collapsed into one Issue
// titled after whichever fired last. Two segments ("nd:playlist") separate them
// while still keeping every id-scoped instance of one query together.
function queryEndpoint(queryKey: readonly unknown[]): string {
  const [first, second] = queryKey;
  if (first == null) return "query";
  return typeof second === "string" && second.length > 0
    ? `${String(first)}:${second}`
    : String(first);
}

export const queryClient = new QueryClient({
  // Safety net: any query/mutation failure not already reported at its service
  // chokepoint is reported here, tagged by the active backend. The classifier
  // (and reportError's dedupe) drop offline noise and already-reported errors,
  // so this only fires for genuinely-unreported failures.
  queryCache: new QueryCache({
    onError: (error, query) => {
      const networkNoise = isNetworkNoise(error);
      kickReachabilityProbeIfUnreachable(networkNoise);
      reportError(
        error,
        {
          area: "api",
          backend: activeBackend(),
          endpoint: queryEndpoint(query.queryKey),
        },
        networkNoise,
      );
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

// A lyrics lookup that found nothing. Worth keeping for the session (the fan-out
// is up to seven requests), but never worth persisting: a miss is only ever a
// snapshot of one moment — LRCLIB's edge rejecting the request, a block, tags
// that didn't match yet, a track it hadn't indexed — and restoring it would pin
// "no lyrics" on that track for the full 7-day maxAge with nothing able to
// dislodge it. A *found* sheet persists as normal: lyrics don't change, and
// keeping them is what makes them available offline.
function isEmptyLyricsLookup(query: Query): boolean {
  return query.queryKey[0] === "lrclib" && query.state.data == null;
}

export function shouldPersistQuery(query: Query): boolean {
  return (
    defaultShouldDehydrateQuery(query) &&
    // Infinite-list pages don't restore cleanly; skip them.
    !String(query.queryKey[0]).includes(":infinite") &&
    // The manual lyrics picker's candidate list only means anything while its
    // sheet is open — persisting a result set per track browsed would grow the
    // cache for nothing.
    query.queryKey[0] !== "lrclib:search" &&
    !isEmptyLyricsLookup(query)
  );
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
