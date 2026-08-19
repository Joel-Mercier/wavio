import { Directory, File, Paths } from "expo-file-system";
import {
  type CacheableTrack,
  cacheEstimatedBytes,
  cacheFetchUrl,
} from "@/services/backend/streaming";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import useTrackCache, { type TrackCacheEntry } from "@/stores/trackCache";
import { logError } from "@/utils/log";

/**
 * The prefetch cache's disk half (issue #163) — speculative copies of upcoming
 * queue tracks, so a reception dropout mid-queue is silent instead of a stall.
 *
 * Structured after services/artworkMirror.ts, and rooted at `Paths.cache` for
 * the same reasons: every entry is re-derivable from the server, the OS is
 * welcome to reclaim it under storage pressure, and it must not ride along in a
 * backup. That reclaim is not hypothetical, which is why `cachedTrackUri` checks
 * the file rather than trusting the index.
 *
 * Files live at:
 *   {Paths.cache}/track-cache/{scope}/{trackId}/{server-named file}
 *
 * One directory per track because the filename comes from the server response
 * (see cacheFetchUrl) and two tracks can easily be handed the same name. It also
 * makes eviction a single directory delete.
 */

// Below this a "download" is far more likely to be a JSON/HTML error page saved
// under an audio name than real audio — Subsonic reports API errors as HTTP 200
// with an envelope body. Same guard as services/offline/downloadService.ts.
const SUSPICIOUS_BYTES = 8192;

// Eviction score half-life. A track played today outranks one played a fortnight
// ago by 2x, which is slow enough that a rotation of favourites survives a week
// of listening to something else, and fast enough that last month's album
// eventually yields its space.
const HALF_LIFE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const cacheRootFor = (scope: string): Directory =>
  new Directory(Paths.cache, "track-cache", scope);

const cacheRoot = (): Directory => cacheRootFor(currentAuthScope());

// Track ids are opaque (Subsonic ids, Jellyfin GUIDs), so keep only what is safe
// in a path segment. Same sanitizer as services/waveform/source.ts.
const sanitize = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, "_");

const trackDir = (id: string): Directory =>
  new Directory(cacheRoot(), sanitize(id));

// The extension the server actually named the file with. Only recorded for
// diagnostics — playback reads the stored path, not this — so a server that
// named it without one just leaves the field empty rather than getting the whole
// URI stuffed into it.
function suffixFromUri(uri: string): string | null {
  const name = uri.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

function safeDelete(target: Directory | File): void {
  try {
    if (target.exists) target.delete();
  } catch {
    // Best effort — a leftover entry in the OS cache directory is harmless, and
    // the store no longer references it.
  }
}

/**
 * The on-disk URI for a cached track, or null.
 *
 * Synchronous by design: `resolveTrackUrl` in services/player.ts calls this
 * during a track change and cannot yield, so a warm entry has to answer without
 * a round trip. The `exists` check is what makes the index safe to trust — these
 * files sit in the OS cache directory and can be reclaimed behind our back.
 */
export function cachedTrackUri(trackId: string): string | null {
  const entry = useTrackCache.getState().getEntry(trackId);
  if (!entry) return null;
  try {
    const file = new File(entry.path);
    if (!file.exists || file.size === 0) {
      // Reclaimed by the OS (or an interrupted write). Drop the index entry so
      // the prefetcher re-fetches it instead of believing it's covered.
      useTrackCache.getState().removeEntries([trackId]);
      return null;
    }
    return entry.path;
  } catch {
    return null;
  }
}

export function isCached(trackId: string): boolean {
  return cachedTrackUri(trackId) != null;
}

/** Records a play off a cached entry, feeding the eviction score. */
export function touchCachedTrack(trackId: string): void {
  // Called only from resolveTrackUrl, so this is the one unambiguous "playback
  // is reading from disk, not the network" signal — cachedTrackUri itself runs
  // inside queue scans and would log hundreds of lines per skip.
  useTrackCache.getState().touchEntry(trackId);
}

export function cacheBytes(): number {
  return useTrackCache.getState().totalBytes;
}

/** Drop specific entries and their files. */
export function evictTracks(trackIds: string[]): void {
  if (trackIds.length === 0) return;
  for (const trackId of trackIds) safeDelete(trackDir(trackId));
  useTrackCache.getState().removeEntries(trackIds);
}

/**
 * Drop everything for the active scope.
 *
 * Also the right answer for the Navidrome canonical-id migration: unlike
 * downloads, whose ids the migration painstakingly remaps because the bytes are
 * user-owned, every cache entry is re-derivable — wiping is both correct and
 * cheaper than rewriting.
 */
export function clearTrackCache(): void {
  // Bumps the generation rather than only emptying the map: a download already
  // in flight would otherwise finish and register an entry into the index the
  // user just wiped, pointing into a directory tree that no longer exists.
  discardInFlightCacheWrites();
  safeDelete(cacheRoot());
  useTrackCache.getState().clearEntries();
}

/**
 * Delete a *different* scope's cache directory, by scope key.
 *
 * Needed on a server switch: the store is scoped, so resetting it only clears
 * the index in memory, and `cacheRoot()` already points at the incoming server
 * by the time the reset runs — nothing would ever come back for the outgoing
 * server's files. They are speculative copies belonging to a server the user is
 * leaving, so they go. Switching back just re-prefetches.
 */
export function clearTrackCacheForScope(scope: string): void {
  safeDelete(cacheRootFor(scope));
}

/**
 * How badly we want to keep an entry. Lowest is evicted first.
 *
 * Frequency with exponential recency decay, divided by size: a 40 MB lossless
 * track has to earn its slot against the ten small ones that fit in the same
 * space. `playCount + 1` keeps a never-played entry ranked by recency instead of
 * flattening every one of them to zero, and the anchor falls back to `cachedAt`
 * so a fresh prefetch isn't treated as infinitely stale.
 */
export function evictionScore(entry: TrackCacheEntry, now: number): number {
  const anchor = Math.max(entry.lastPlayedAt, entry.cachedAt);
  const ageDays = Math.max(0, now - anchor) / DAY_MS;
  const decay = 0.5 ** (ageDays / HALF_LIFE_DAYS);
  const megabytes = Math.max(entry.bytes, 1) / (1024 * 1024);
  return ((entry.playCount + 1) * decay) / megabytes;
}

/**
 * Evict lowest-scoring entries until the cache fits `budgetBytes`.
 *
 * `pinnedIds` (the upcoming window) is exempt, so the cache never evicts the
 * very tracks it just fetched to play next. If the pinned set alone exceeds the
 * budget nothing more can be freed — admission control in the prefetcher is what
 * stops it growing further, which is what makes "budget wins, window truncates"
 * true rather than aspirational.
 */
export function pruneToBudget(
  budgetBytes: number,
  pinnedIds: ReadonlySet<string>,
): void {
  const state = useTrackCache.getState();
  if (state.totalBytes <= budgetBytes) return;

  const now = Date.now();
  const candidates = state
    .getEntriesList()
    .filter((entry) => !pinnedIds.has(entry.id))
    .sort((a, b) => evictionScore(a, now) - evictionScore(b, now));

  let freed = 0;
  const evicted: string[] = [];
  for (const entry of candidates) {
    if (state.totalBytes - freed <= budgetBytes) break;
    freed += entry.bytes;
    evicted.push(entry.id);
  }
  evictTracks(evicted);
}

/**
 * Reconcile the index against the filesystem.
 *
 * Called on scope hydration. Entries whose file the OS reclaimed (or whose write
 * an app kill interrupted) are dropped, and directories with no index entry —
 * the other half of the same interruption — are deleted.
 */
export function reconcileTrackCache(): void {
  const state = useTrackCache.getState();
  const stale: string[] = [];
  for (const entry of state.getEntriesList()) {
    try {
      const file = new File(entry.path);
      if (!file.exists || file.size === 0) stale.push(entry.id);
    } catch {
      stale.push(entry.id);
    }
  }
  if (stale.length > 0) evictTracks(stale);

  try {
    const root = cacheRoot();
    if (!root.exists) return;
    const known = new Set(
      useTrackCache
        .getState()
        .getEntriesList()
        .map((entry) => sanitize(entry.id)),
    );
    // A download in flight has no index entry yet — its directory is
    // indistinguishable from one an app kill interrupted, and deleting it pulls
    // the file out from under an active write. Not hypothetical: a same-scope
    // re-login re-runs resumeTrackCachePrefetch while the prefetcher is working.
    for (const id of inFlight.keys()) known.add(sanitize(id));
    for (const child of root.list()) {
      if (child instanceof Directory && !known.has(child.name)) {
        safeDelete(child);
      }
    }
  } catch (error) {
    logError("[trackCache] Failed to sweep orphaned directories", error);
  }
}

// Deduplicates concurrent callers; the lasting cache is the file on disk.
const inFlight = new Map<string, Promise<boolean>>();

// Bumped by clearTrackCache and by a scope change, so a download that outlived
// either discards its result instead of registering into a wiped index.
let generation = 0;

export function discardInFlightCacheWrites(): void {
  generation++;
  inFlight.clear();
}

export function isCaching(trackId: string): boolean {
  return inFlight.has(trackId);
}

export function estimatedBytesFor(track: CacheableTrack): number {
  return cacheEstimatedBytes(track);
}

/**
 * Fetch `track` into the cache. Resolves true when a usable file landed.
 *
 * Never reports to Sentry: a speculative prefetch failing against a server that
 * is briefly unreachable is an ordinary outcome, and the whole point of the
 * feature is to run on connections that are already unreliable. The caller
 * counts failures and backs off instead.
 */
export async function cacheTrack(track: CacheableTrack): Promise<boolean> {
  const existing = inFlight.get(track.id);
  if (existing) return existing;

  const task = (async () => {
    const startGeneration = generation;
    const url = cacheFetchUrl(track);
    if (!url) {
      return false;
    }

    const dir = trackDir(track.id);
    // A leftover from an interrupted attempt would leave two files in the
    // directory and no way to tell which is whole.
    safeDelete(dir);
    dir.create({ idempotent: true, intermediates: true });

    let result: File;
    try {
      // Destination is the *directory*: expo-file-system then names the file
      // from the server's own response, which is the only way to learn the
      // container when a bitrate cap makes the server pick one (see
      // cacheFetchUrl). The extension is load-bearing on iOS.
      result = await File.downloadFileAsync(url, dir, {
        idempotent: true,
        headers: requestHeadersForUrl(url),
      });
    } catch {
      safeDelete(dir);
      return false;
    }

    if (!result.exists) {
      safeDelete(dir);
      return false;
    }

    const bytes = result.size ?? 0;
    // An empty body sniffs as neither JSON nor HTML, so it would otherwise be
    // recorded as a success — and `cachedTrackUri` drops a zero-byte entry on
    // sight, leaving the drain to re-fetch the same nothing forever with the
    // failure counter reset on every pass.
    if (bytes === 0) {
      safeDelete(dir);
      return false;
    }
    if (bytes < SUSPICIOUS_BYTES) {
      const head = (await result.text()).trimStart();
      if (head.startsWith("{") || head.startsWith("<")) {
        safeDelete(dir);
        return false;
      }
    }

    // The cache was cleared, or the scope changed, while this was in flight.
    if (generation !== startGeneration) {
      safeDelete(dir);
      return false;
    }

    // The user saved the track for offline while this was in flight. Downloads
    // always win, and holding both would be paying for the same bytes twice.
    if (useOffline.getState().isTrackDownloaded(track.id)) {
      safeDelete(dir);
      return false;
    }

    const now = Date.now();
    useTrackCache.getState().putEntry({
      id: track.id,
      path: result.uri,
      bytes,
      suffix: suffixFromUri(result.uri) ?? track.suffix ?? "",
      cachedAt: now,
      lastPlayedAt: 0,
      playCount: 0,
    });
    return true;
  })();

  inFlight.set(track.id, task);
  const forget = () => {
    inFlight.delete(track.id);
  };
  void task.then(forget, forget);
  return task;
}

/** Whether there is an active server to fetch from at all. */
export function hasActiveServer(): boolean {
  const { url, username } = useAuthBase.getState();
  return !!url && !!username;
}
