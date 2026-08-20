import { getCapabilities } from "@/services/backend/capabilities";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import { offlineDownloadService } from "@/services/offline/downloadService";
import {
  hasTranscodeRetried,
  mustStreamOverOffline,
} from "@/services/playback/decodeFallback";
import {
  cacheBytes,
  cacheTrack,
  estimatedBytesFor,
  hasActiveServer,
  isCached,
  isCaching,
  pruneToBudget,
  reconcileTrackCache,
} from "@/services/trackCache";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import useQueue, { peekNextTracks, type QueueTrack } from "@/stores/queue";

/**
 * Keeps the next N queue tracks on disk (issue #163), so playback survives a
 * reception dropout instead of stalling on it.
 *
 * Lives outside the React tree, like services/widget.ts: Android Auto binds the
 * media service without ever starting an Activity, so anything wired from a
 * component would never run in the cold-car case — exactly the drive this
 * feature exists for.
 *
 * Deliberately timid. Every rule here exists so a speculative fetch can never
 * degrade the thing it is trying to protect: one download at a time (the offline
 * download service uses three), nothing at all while the user has real downloads
 * running, and a hard stop the moment the disk budget is reached.
 */

// One at a time, and below the download service's MAX_CONCURRENT_DOWNLOADS. The
// track being *streamed right now* is competing for the same connection, and
// losing that race is a stall the user hears.
const MAX_CONCURRENT_PREFETCH = 1;

// Consecutive failures before the drain parks. Sized well below the download
// service's tolerance: a prefetch has nobody waiting on it, so backing off early
// costs nothing and stops a dead server being hammered from the background.
const FAILURE_CIRCUIT_BREAK = 2;

const RETRY_BACKOFF_STEPS_MS = [30_000, 120_000, 600_000];

let active = 0;
let consecutiveFailures = 0;
// How far into RETRY_BACKOFF_STEPS_MS the next park goes. Deliberately separate
// from `consecutiveFailures`, which the retry timer resets to give the window a
// clean pass: deriving the step from it would pin every park at the first step,
// so a dead server would be re-probed every 30s forever.
let retryStep = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
// Ids this pass has already given up on, so a track the server refuses isn't
// retried on every single queue change. Cleared whenever the drain succeeds at
// anything, and on resume().
const givenUp = new Set<string>();

function budgetBytes(): number {
  return useAppBase.getState().trackCacheBudgetMb * 1024 * 1024;
}

/**
 * Whether prefetching is allowed at all right now.
 *
 * Note this deliberately does NOT consult `downloadsWifiOnly`: that setting is
 * about permanent saves, and someone who restricts those to Wi-Fi still wants
 * their queue to survive a drive. Cellular has its own opt-out.
 */
function canPrefetch(): boolean {
  const { trackCacheEnabled, trackCacheOnCellular } = useAppBase.getState();
  if (!trackCacheEnabled) return false;
  if (!hasActiveServer()) return false;
  // The on-device library has nothing to prefetch: its tracks are already files
  // on this phone, so `cacheFetchUrl` returns null for every one of them and
  // each attempt would count as a failure, parking the drain on a permanent
  // retry cycle that can never succeed.
  if (!getCapabilities(useAuthBase.getState().serverType).offlineDownload) {
    return false;
  }
  if (!getIsEffectivelyOnline()) return false;
  if (!trackCacheOnCellular && getConnectionType() === "cellular") return false;
  // A save the user asked for outranks anything speculative — and the two would
  // otherwise pull from the same server over the same link.
  if (offlineDownloadService.hasActiveWork()) return false;
  return true;
}

/**
 * Tracks the cache should not hold, whatever the queue says.
 *
 * Radio and podcasts stream an absolute URL on someone else's host; a downloaded
 * track already has permanent bytes and always wins in resolveTrackUrl; the
 * on-device library is already a file. `cacheFetchUrl` returns null for the last
 * of those too, so this is about not wasting the attempt.
 */
function isCacheable(track: QueueTrack): boolean {
  if (track.isRadio) return false;
  if (track.source === "podcast") return false;
  if (useOffline.getState().isTrackDownloaded(track.id)) return false;
  // This device already failed to decode these bytes, so resolveTrackUrl streams
  // the track from the server whatever is on disk — a cached copy would be paid
  // for and never read. (The decode-error handler evicts the entry, which is
  // exactly what would otherwise let the drain fetch it straight back.)
  if (mustStreamOverOffline(track.id) || hasTranscodeRetried(track.id)) {
    return false;
  }
  // Queued for a real download: it is about to have permanent bytes, so caching
  // it now is paying twice for the same audio.
  if (useOffline.getState().downloadQueue.some((t) => t.id === track.id)) {
    return false;
  }
  return true;
}

/** The window: what playback will reach next, minus what it can't cache. */
function currentWindow(): QueueTrack[] {
  const { trackCacheCount } = useAppBase.getState();
  const currentId = useQueue.getState().getCurrent()?.id;
  return peekNextTracks(trackCacheCount).filter(
    // The current track is already streaming or already cached; fetching it
    // again would compete with its own playback. Under repeat-one it is the
    // only thing peekNextTracks can return, which is the case this guards.
    (track) => track.id !== currentId && isCacheable(track),
  );
}

/**
 * What eviction may not touch: the window, plus whatever is playing right now.
 *
 * The current track is deliberately *not* in the window — re-fetching it would
 * compete with its own playback — but it is the last file eviction should take.
 * The score divides by size, so a big track that just started ranks below every
 * small speculative copy and would be freed first. Playback rides on the open
 * handle for a while, which is what makes this quiet: the loss only surfaces on
 * the next seek, route change or restart, when the path is reopened and there is
 * nothing there.
 */
function pinnedIds(window: QueueTrack[]): Set<string> {
  const pinned = new Set(window.map((track) => track.id));
  const currentId = useQueue.getState().getCurrent()?.id;
  if (currentId) pinned.add(currentId);
  return pinned;
}

function scheduleRetry(): void {
  if (retryTimer) return;
  const delay =
    RETRY_BACKOFF_STEPS_MS[
      Math.min(retryStep, RETRY_BACKOFF_STEPS_MS.length - 1)
    ];
  retryStep += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    consecutiveFailures = 0;
    // The backoff *was* the punishment. Without clearing this, every track the
    // failed pass gave up on stays given-up, so the drain wakes, finds the whole
    // window blacklisted, and returns — making a transient outage permanent for
    // that window.
    givenUp.clear();
    void drain();
  }, delay);
}

function clearRetry(): void {
  if (!retryTimer) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

/**
 * Fill the window, one track at a time, within the budget.
 *
 * The budget is the harder of the two rules: when the next track would not fit
 * even after evicting everything unpinned, the drain stops rather than
 * overshooting the cap. That is what "budget wins, window truncates" means in
 * practice — a 20-track window on a lossless library simply caches fewer than 20.
 */
async function drain(): Promise<void> {
  if (active >= MAX_CONCURRENT_PREFETCH) return;
  if (retryTimer) return;
  if (!canPrefetch()) return;

  const window = currentWindow();
  if (window.length === 0) return;

  const pinned = pinnedIds(window);
  const budget = budgetBytes();

  const track = window.find(
    (candidate) =>
      !isCached(candidate.id) &&
      !isCaching(candidate.id) &&
      !givenUp.has(candidate.id),
  );
  if (!track) {
    return;
  }

  // Make room first: everything this evicts is by definition outside the window,
  // so nothing playback is about to need is at risk.
  pruneToBudget(budget, pinned);

  const estimate = estimatedBytesFor(track);
  if (cacheBytes() + estimate > budget) {
    // No room, and pruning has already taken everything it can. Later window
    // entries are no more likely to fit, and caching one out of order would
    // leave the hole exactly where playback arrives first.
    return;
  }

  active += 1;
  try {
    // Catches as well as tests the result: every caller reaches this through
    // `void drain()`, so anything cacheTrack throws that its own guards missed
    // (a directory it can't create, a body it can't read) would surface as an
    // unhandled rejection rather than a skipped track.
    const ok = await cacheTrack(track).catch(() => false);
    if (ok) {
      consecutiveFailures = 0;
      retryStep = 0;
      givenUp.clear();
      // The real size is known now, and may have overshot the estimate.
      pruneToBudget(budget, pinned);
    } else {
      consecutiveFailures += 1;
      givenUp.add(track.id);
    }
  } finally {
    active -= 1;
  }

  if (consecutiveFailures >= FAILURE_CIRCUIT_BREAK) {
    scheduleRetry();
    return;
  }
  // The queue may have moved while that download ran, so recompute from scratch
  // rather than finishing a window that no longer describes what plays next.
  void drain();
}

function kick(): void {
  void drain();
}

/**
 * Start (or restart) prefetching for the active scope.
 *
 * Called from the scope-hydration path in app/(app)/_layout.tsx for the same
 * reason offlineDownloadService.resume() is: rehydration is synchronous, so this
 * sees the restored queue and picks up where an app kill left off instead of
 * waiting for the user to touch something.
 */
export function resumeTrackCachePrefetch(): void {
  consecutiveFailures = 0;
  retryStep = 0;
  givenUp.clear();
  clearRetry();
  reconcileTrackCache();

  if (!started) {
    started = true;
    // Queue movement is the primary trigger: a track change, a skip, a reorder,
    // or an enqueue all change what plays next.
    useQueue.subscribe((next, prev) => {
      if (
        next.queue !== prev.queue ||
        next.currentIndex !== prev.currentIndex
      ) {
        kick();
      }
    });
    // Settings changes: turning the cache on, widening the window, or allowing
    // cellular should take effect without waiting for the next track.
    useAppBase.subscribe((next, prev) => {
      if (
        next.trackCacheEnabled !== prev.trackCacheEnabled ||
        next.trackCacheCount !== prev.trackCacheCount ||
        next.trackCacheBudgetMb !== prev.trackCacheBudgetMb ||
        next.trackCacheOnCellular !== prev.trackCacheOnCellular
      ) {
        clearRetry();
        consecutiveFailures = 0;
        retryStep = 0;
        givenUp.clear();
        kick();
      }
    });
    subscribeEffectiveOnline(() => {
      if (getIsEffectivelyOnline()) {
        clearRetry();
        consecutiveFailures = 0;
        retryStep = 0;
        kick();
      }
    });
    subscribeConnectionType(() => kick());
    // A finished download frees the connection this deliberately yielded.
    useOffline.subscribe((next, prev) => {
      if (next.downloadQueue !== prev.downloadQueue) kick();
    });
  }

  kick();
}

/** Test seam — drops subscriptions' effect on a fresh run. */
export function __resetTrackCachePrefetch(): void {
  active = 0;
  consecutiveFailures = 0;
  retryStep = 0;
  givenUp.clear();
  clearRetry();
}
