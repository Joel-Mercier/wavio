import axios from "axios";
import { isNetworkNoise, reportError } from "@/services/errorReporting";
import {
  MAX_LISTENS_PER_REQUEST,
  submitNowPlaying as postNowPlaying,
  submitListens,
} from "@/services/listenBrainz/client";
import { toListen, toQueuedListen } from "@/services/listenBrainz/payload";
import { getIsOnline, subscribeIsOnline } from "@/services/network";
import {
  isListenBrainzConnected,
  isListenBrainzScrobblingEnabled,
  type QueuedListen,
  useListenBrainzBase,
} from "@/stores/listenBrainz";
import type { QueueTrack } from "@/stores/queue";

// ListenBrainz counts a play once the listener has heard half the track, or
// four minutes, whichever comes first.
// https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
const MAX_SUBMIT_THRESHOLD_SECONDS = 240;
// Tracks shorter than this are never submitted, matching the long-standing
// Last.fm/ListenBrainz convention (and the app's own server-scrobble guard).
const MIN_TRACK_DURATION_SECONDS = 30;

// Only transient failures (5xx, 429, network) consume an attempt — a permanent
// 4xx drops the batch immediately — so this cap has to outlast a real outage,
// not a blip: with the backoff below topping out at 30 minutes it spans roughly
// two days of connected time. The store's own 2000-listen bound is what keeps
// the queue from growing forever, so there's no need to be stingy here.
export const MAX_ATTEMPTS = 100;
const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];

let started = false;
let unsubscribeOnline: (() => void) | null = null;
let lastOnline = false;
let draining = false;
let drainRequested = false;
let generation = 0;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let backoffLevel = 0;

/**
 * The position, in seconds, at which a track of this duration becomes a
 * submittable listen. Exported for the player and for tests.
 */
export function submissionThresholdSeconds(duration: number): number {
  return Math.min(duration / 2, MAX_SUBMIT_THRESHOLD_SECONDS);
}

export function isSubmittableDuration(duration: number): boolean {
  return duration >= MIN_TRACK_DURATION_SECONDS;
}

const clearBackoffTimer = () => {
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
};

const scheduleBackoff = () => {
  if (backoffTimer) return;
  const delay =
    BACKOFF_STEPS_MS[Math.min(backoffLevel, BACKOFF_STEPS_MS.length - 1)];
  backoffLevel++;
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void drainListenQueue();
  }, delay);
};

const httpStatus = (error: unknown): number | undefined =>
  axios.isAxiosError(error) ? error.response?.status : undefined;

// A 4xx other than 429 means this batch will never be accepted — a revoked
// token, or metadata the API refuses. Retrying forever would pin the queue, so
// the batch is dropped. 429 is explicitly *not* permanent: it's the rate
// limiter asking us to wait.
const isPermanentError = (error: unknown) => {
  const status = httpStatus(error);
  if (status === undefined) return false;
  return status >= 400 && status < 500 && status !== 429;
};

/**
 * Records a finished play. Never submits inline: the queue is the single path
 * to ListenBrainz, so a listen behaves identically whether the device is online
 * or not, and `listened_at` is pinned to when the track actually started.
 */
export function enqueueListen(track: QueueTrack, listenedAt: number): void {
  if (!isListenBrainzScrobblingEnabled()) return;
  const queued = toQueuedListen(track, Math.floor(listenedAt / 1000));
  if (!queued) return;
  useListenBrainzBase.getState().enqueueListen(queued);
  void drainListenQueue();
}

/**
 * Tells ListenBrainz what is playing right now. Ephemeral by design — it is
 * never queued, because a "playing now" that arrives after the song ended is
 * worse than nothing.
 */
export function submitNowPlaying(track: QueueTrack): void {
  if (!isListenBrainzScrobblingEnabled()) return;
  if (!useListenBrainzBase.getState().submitNowPlaying) return;
  if (!getIsOnline()) return;
  const queued = toQueuedListen(track, 0);
  if (!queued) return;
  void postNowPlaying({
    listen_type: "playing_now",
    payload: [toListen(queued, { includeTimestamp: false })],
  });
}

export async function drainListenQueue(): Promise<void> {
  if (draining) {
    drainRequested = true;
    return;
  }
  // Gated on the connection alone, not on the scrobbling toggle: plays already
  // in the queue were earned while it was on, and turning it off must stop new
  // ones being recorded (see enqueueListen), not strand the pending ones.
  if (!isListenBrainzConnected()) return;
  draining = true;
  const gen = generation;
  clearBackoffTimer();
  try {
    // Keyed off *device* connectivity, not getIsEffectivelyOnline(): that also
    // requires the user's music server to answer, and ListenBrainz has nothing
    // to do with it. A local library has no server at all, and a Navidrome that
    // is down must not hold plays hostage.
    while (getIsOnline()) {
      if (gen !== generation) return;
      const batch = useListenBrainzBase
        .getState()
        .queue.slice(0, MAX_LISTENS_PER_REQUEST);
      if (batch.length === 0) break;
      const ids = batch.map((item) => item.id);
      try {
        await submitBatch(batch);
        if (gen !== generation) return;
        useListenBrainzBase.getState().removeListens(ids);
        backoffLevel = 0;
      } catch (error) {
        if (gen !== generation) return;
        if (isNetworkNoise(error) || !getIsOnline()) break;
        const permanent = isPermanentError(error);
        const exhausted = batch[0].retryCount + 1 >= MAX_ATTEMPTS;
        if (permanent || exhausted) {
          useListenBrainzBase.getState().removeListens(ids);
          reportError(error, {
            area: "api",
            api: "listenbrainz",
            endpoint: "submit-listens",
            status: httpStatus(error),
            // A stale or revoked token is the user's to fix in settings, not a
            // bug — the screen surfaces it as a disconnected integration.
            unauthorizedIsExpected: true,
            extra: { listenCount: batch.length, permanent },
          });
        } else {
          useListenBrainzBase.getState().bumpRetry(ids);
        }
        break;
      }
    }
  } finally {
    draining = false;
  }
  // Before the generation check: a drain requested mid-flight is usually the
  // incoming scope's init() after a server switch (which bumps the generation),
  // and dropping it would leave that scope's listens waiting for the next play.
  if (drainRequested) {
    drainRequested = false;
    void drainListenQueue();
    return;
  }
  if (gen !== generation) return;
  if (useListenBrainzBase.getState().queue.length > 0) scheduleBackoff();
}

async function submitBatch(batch: QueuedListen[]): Promise<void> {
  // "single" carries exactly one listen; anything larger must go as "import".
  await submitListens({
    listen_type: batch.length === 1 ? "single" : "import",
    payload: batch.map((item) => toListen(item, { includeTimestamp: true })),
  });
}

/**
 * Call once after the ListenBrainz store has hydrated for the active scope.
 * Drains whatever the last session left behind, then on every offline→online
 * transition.
 */
export function initListenBrainzScrobbler(): void {
  if (started) return;
  started = true;
  lastOnline = getIsOnline();
  unsubscribeOnline = subscribeIsOnline(() => {
    const online = getIsOnline();
    if (online && !lastOnline) void drainListenQueue();
    lastOnline = online;
  });
  if (lastOnline) void drainListenQueue();
}

export function stopListenBrainzScrobbler(): void {
  unsubscribeOnline?.();
  unsubscribeOnline = null;
  clearBackoffTimer();
  backoffLevel = 0;
  generation++;
  drainRequested = false;
  started = false;
}

export function resetListenBrainzScrobbler(): void {
  stopListenBrainzScrobbler();
}
