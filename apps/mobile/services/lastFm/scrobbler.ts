import { queryClient } from "@/config/queryClient";
import {
  isNetworkNoise,
  reportBreadcrumb,
  reportError,
} from "@/services/errorReporting";
import {
  loveTrack,
  MAX_SCROBBLES_PER_REQUEST,
  submitScrobbles,
  updateNowPlaying,
} from "@/services/lastFm/api";
import {
  isPermanentLastFmError,
  isSessionInvalid,
  lastFmErrorCode,
} from "@/services/lastFm/errors";
import {
  toNowPlayingParams,
  toQueuedScrobble,
  toScrobbleParams,
} from "@/services/lastFm/payload";
import type { LastFmParams } from "@/services/lastFm/signature";
import { getIsOnline, subscribeIsOnline } from "@/services/network";
import {
  isLastFmConnected,
  isLastFmScrobblingEnabled,
  type QueuedLove,
  type QueuedScrobble,
  useLastFmBase,
} from "@/stores/lastFm";
import type { QueueTrack } from "@/stores/queue";

export {
  isSubmittableDuration,
  submissionThresholdSeconds,
} from "@/services/scrobbling/eligibility";

// Last.fm silently drops a scrobble whose timestamp is "too far in the past"
// (ignoredMessage code 3). The cutoff isn't in the docs, but ~14 days is the
// long-established figure, so anything older is discarded before it is sent
// rather than spending a request to be ignored. This has no ListenBrainz
// counterpart — that API accepts arbitrary backdating.
const MAX_SCROBBLE_AGE_SECONDS = 14 * 24 * 60 * 60;

// Only transient failures (service offline, rate limit, network) consume an
// attempt — a permanent error drops the batch immediately — so this cap has to
// outlast a real outage, not a blip. With the backoff below topping out at 30
// minutes it spans roughly two days of connected time. The store's own bounds
// are what keep the queues from growing forever.
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
    void drainLastFmQueue();
  }, delay);
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Records a finished play. Never submits inline: the queue is the single path to
 * Last.fm, so a play behaves identically whether the device is online or not,
 * and the timestamp is pinned to when the track actually started.
 */
export function enqueueScrobble(track: QueueTrack, startedAt: number): void {
  if (!isLastFmScrobblingEnabled()) return;
  const queued = toQueuedScrobble(track, Math.floor(startedAt / 1000));
  if (!queued) return;
  useLastFmBase.getState().enqueueScrobble(queued);
  void drainLastFmQueue();
}

/**
 * Tells Last.fm what is playing right now. Ephemeral by design — never queued,
 * because a "scrobbling now" that arrives after the song ended is worse than
 * nothing.
 */
export function submitNowPlaying(track: QueueTrack): void {
  if (!isLastFmScrobblingEnabled()) return;
  if (!useLastFmBase.getState().submitNowPlaying) return;
  if (!getIsOnline()) return;
  const queued = toQueuedScrobble(track, 0);
  if (!queued) return;
  void updateNowPlaying(toNowPlayingParams(queued)).catch((error) => {
    if (isNetworkNoise(error)) return;
    noteSessionInvalid(error);
    reportError(error, {
      area: "api",
      api: "lastfm",
      endpoint: "track.updateNowPlaying",
      status: lastFmErrorCode(error),
      // A revoked session is the user's to fix in settings, not a bug — the
      // screen surfaces it as an integration needing to be reconnected.
      unauthorizedIsExpected: true,
    });
  });
}

/**
 * Records a love/unlove. Queued like a scrobble so it survives being offline,
 * and gated on the opt-in toggle rather than on `scrobblingEnabled`: loving is a
 * write to the user's account that they asked for separately.
 */
export function enqueueLove(
  artist: string,
  track: string,
  loved: boolean,
): void {
  if (!isLastFmConnected()) return;
  if (!useLastFmBase.getState().syncLoves) return;
  const trimmedArtist = artist.trim();
  const trimmedTrack = track.trim();
  if (!trimmedArtist || !trimmedTrack) return;
  useLastFmBase
    .getState()
    .enqueueLove({ artist: trimmedArtist, track: trimmedTrack, loved });
  void drainLastFmQueue();
}

// A revoked session key can never be retried into working, so the store flips
// into its re-auth state and every submission gate closes until the user signs
// in again. The queues are deliberately left alone: those plays were earned, and
// they drain once a new session key arrives.
const noteSessionInvalid = (error: unknown) => {
  if (isSessionInvalid(error)) {
    useLastFmBase.getState().setSessionInvalid(true);
  }
};

/**
 * The loved-track reads are cached for fifteen minutes because loves move only
 * when someone taps a heart — but that tap is exactly what just happened, so the
 * settings screen has to be told rather than left showing a count from before
 * the love landed (which is also what greys out the import).
 */
const invalidateLovedTracks = () => {
  void queryClient.invalidateQueries({ queryKey: ["lastfm", "lovedTracks"] });
};

const reportSubmissionFailure = (
  error: unknown,
  endpoint: string,
  extra: Record<string, unknown>,
) => {
  reportError(error, {
    area: "api",
    api: "lastfm",
    endpoint,
    status: lastFmErrorCode(error),
    unauthorizedIsExpected: true,
    extra,
  });
};

/**
 * Drops queued scrobbles Last.fm would refuse on age alone, and returns whatever
 * is still submittable. Run at drain time rather than at enqueue time: a play
 * queued on a device that stayed offline for three weeks was perfectly valid
 * when it was recorded.
 */
const dropStaleScrobbles = (): QueuedScrobble[] => {
  const cutoff = nowSeconds() - MAX_SCROBBLE_AGE_SECONDS;
  const queue = useLastFmBase.getState().queue;
  const stale = queue.filter((item) => item.timestamp < cutoff);
  if (stale.length > 0) {
    useLastFmBase.getState().removeScrobbles(stale.map((item) => item.id));
  }
  return queue.filter((item) => item.timestamp >= cutoff);
};

const scrobbleBatchParams = (batch: QueuedScrobble[]): LastFmParams => {
  // A single scrobble may drop the `[i]` suffix entirely, and doing so keeps the
  // request (and its signature) closest to what the docs show.
  if (batch.length === 1) return toScrobbleParams(batch[0], null);
  return batch.reduce<LastFmParams>(
    (params, item, index) =>
      Object.assign(params, toScrobbleParams(item, index)),
    {},
  );
};

async function submitScrobbleBatch(batch: QueuedScrobble[]): Promise<void> {
  const outcome = await submitScrobbles(scrobbleBatchParams(batch));
  if (outcome.ignored > 0) {
    // Filtering is a `status: "ok"` outcome, not a failure: the artist or track
    // is on Last.fm's ignore list, the timestamp is out of range, or the daily
    // cap is hit. Nothing here is retryable, so the batch is still removed — a
    // breadcrumb rather than an error report, so that "my play never showed up"
    // is answerable from a later Sentry event without being noise on its own.
    reportBreadcrumb("lastfm", "scrobbles ignored", {
      ignored: outcome.ignored,
      accepted: outcome.accepted,
      batchSize: batch.length,
      codes: outcome.ignoredCodes,
    });
  }
}

async function drainScrobbles(gen: number): Promise<boolean> {
  while (getIsOnline()) {
    if (gen !== generation) return false;
    // Cached scrobbles must reach Last.fm before newer ones, so the queue is
    // always drained from the front.
    const batch = dropStaleScrobbles().slice(0, MAX_SCROBBLES_PER_REQUEST);
    if (batch.length === 0) return true;
    const ids = batch.map((item) => item.id);
    try {
      await submitScrobbleBatch(batch);
      if (gen !== generation) return false;
      useLastFmBase.getState().removeScrobbles(ids);
      backoffLevel = 0;
    } catch (error) {
      if (gen !== generation) return false;
      if (isNetworkNoise(error) || !getIsOnline()) return false;
      noteSessionInvalid(error);
      const permanent = isPermanentLastFmError(error);
      const exhausted = batch[0].retryCount + 1 >= MAX_ATTEMPTS;
      if (permanent || exhausted) {
        useLastFmBase.getState().removeScrobbles(ids);
        reportSubmissionFailure(error, "track.scrobble", {
          scrobbleCount: batch.length,
          permanent,
        });
      } else {
        useLastFmBase.getState().bumpScrobbleRetry(ids);
      }
      return false;
    }
  }
  return false;
}

async function drainLoves(gen: number): Promise<boolean> {
  let accepted = false;
  while (getIsOnline()) {
    if (gen !== generation) return false;
    // track.love has no batch form, so these go one at a time.
    const next: QueuedLove | undefined = useLastFmBase.getState().loveQueue[0];
    if (!next) {
      if (accepted) invalidateLovedTracks();
      return true;
    }
    try {
      await loveTrack(next.artist, next.track, next.loved);
      if (gen !== generation) return false;
      useLastFmBase.getState().removeLoves([next.id]);
      accepted = true;
      backoffLevel = 0;
    } catch (error) {
      if (gen !== generation) return false;
      if (isNetworkNoise(error) || !getIsOnline()) return false;
      noteSessionInvalid(error);
      const permanent = isPermanentLastFmError(error);
      const exhausted = next.retryCount + 1 >= MAX_ATTEMPTS;
      if (permanent || exhausted) {
        useLastFmBase.getState().removeLoves([next.id]);
        reportSubmissionFailure(error, "track.love", { permanent });
      } else {
        useLastFmBase.getState().bumpLoveRetry([next.id]);
      }
      if (accepted) invalidateLovedTracks();
      return false;
    }
  }
  if (accepted) invalidateLovedTracks();
  return false;
}

export async function drainLastFmQueue(): Promise<void> {
  if (draining) {
    drainRequested = true;
    return;
  }
  // Gated on the connection alone, not on the scrobbling toggle: plays already
  // in the queue were earned while it was on, and turning it off must stop new
  // ones being recorded (see enqueueScrobble), not strand the pending ones. A
  // revoked session, though, means nothing can be accepted until the user signs
  // in again — so hold rather than burn attempts.
  if (!isLastFmConnected()) return;
  if (useLastFmBase.getState().sessionInvalid) return;
  draining = true;
  const gen = generation;
  clearBackoffTimer();
  try {
    // Keyed off *device* connectivity, not getIsEffectivelyOnline(): that also
    // requires the user's music server to answer, and Last.fm has nothing to do
    // with it. A local library has no server at all, and a Navidrome that is
    // down must not hold plays hostage.
    const scrobblesDrained = await drainScrobbles(gen);
    if (gen !== generation) return;
    // Loves only after the scrobbles: a stuck love must not block playback
    // history, which is the part a user notices missing.
    if (scrobblesDrained) await drainLoves(gen);
  } finally {
    draining = false;
  }
  // Before the generation check: a drain requested mid-flight is usually the
  // incoming scope's init() after a server switch (which bumps the generation),
  // and dropping it would leave that scope's plays waiting for the next one.
  if (drainRequested) {
    drainRequested = false;
    void drainLastFmQueue();
    return;
  }
  if (gen !== generation) return;
  const { queue, loveQueue } = useLastFmBase.getState();
  if (queue.length > 0 || loveQueue.length > 0) scheduleBackoff();
}

/**
 * Call once after the Last.fm store has hydrated for the active scope. Drains
 * whatever the last session left behind, then on every offline→online
 * transition.
 */
export function initLastFmScrobbler(): void {
  if (started) return;
  started = true;
  lastOnline = getIsOnline();
  unsubscribeOnline = subscribeIsOnline(() => {
    const online = getIsOnline();
    if (online && !lastOnline) void drainLastFmQueue();
    lastOnline = online;
  });
  if (lastOnline) void drainLastFmQueue();
}

export function stopLastFmScrobbler(): void {
  unsubscribeOnline?.();
  unsubscribeOnline = null;
  clearBackoffTimer();
  backoffLevel = 0;
  generation++;
  drainRequested = false;
  started = false;
}

export function resetLastFmScrobbler(): void {
  stopLastFmScrobbler();
}
