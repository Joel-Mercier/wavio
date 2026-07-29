import { useEffect } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  pause,
  play,
  playTracks,
  seekTo,
  skipNext,
  skipPrevious,
} from "@/services/player";
import { clearArtworkCache, resolveArtworkFile } from "@/services/wear/artwork";
import { WearBridge } from "@/services/wear/bridge";
import {
  PROTOCOL_VERSION,
  QUEUE_WINDOW_AHEAD,
  QUEUE_WINDOW_BEHIND,
  type QueueEntry,
  type StatePayload,
} from "@/services/wear/protocol";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useQueue from "@/stores/queue";

// 2Hz, the ceiling we allow ourselves. It only ticks while the watch says its
// screen is on — see `subscribedUntil`.
const PROGRESS_INTERVAL_MS = 500;

// A subscription is a lease, not a switch: the watch re-asserts it on a
// heartbeat and it expires on its own. `unsubscribe` can never arrive (the app
// is swiped away or crashes mid-send) and the watch keeps advertising its
// capability as long as it is installed, so an un-expiring subscription would
// leave the phone ticking at 2Hz forever — the exact cost this is meant to
// avoid. Generous enough to survive two missed heartbeats.
const SUBSCRIBE_TTL_MS = 45_000;

/**
 * Mirrors playback to the Wear OS companion and applies the commands it sends
 * back. The phone stays the single source of truth; the watch neither streams,
 * authenticates, nor talks to any backend.
 *
 * Everything here is gated on a watch actually being reachable, so users
 * without one pay nothing beyond one capability query at startup.
 */
export default function WearSync() {
  useEffect(() => {
    if (!WearBridge.available) return;

    let cancelled = false;
    // A reachable watch running Wavio. Until this is true nothing is published.
    let hasWatch = false;
    // Epoch after which the watch's now-playing screen is assumed off. Gates the
    // progress ticker so a wrist-down watch costs zero traffic.
    let subscribedUntil = 0;
    let progressTimer: ReturnType<typeof setInterval> | null = null;

    let lastTrackId: string | null = null;
    let lastArtworkKey: string | null = null;
    let lastQueueSig: string | null = null;
    let lastStateSig: string | null = null;
    // Bumped on a scope change so an artwork download started for the previous
    // server can't publish once it resolves.
    let publishEpoch = 0;

    const buildState = (): StatePayload => {
      const snap = getPlaybackSnapshot();
      const q = useQueue.getState();
      const current = q.getCurrent();
      const durationMs = Math.round(
        (snap.duration || current?.duration || 0) * 1000,
      );
      return {
        v: PROTOCOL_VERSION,
        track: current
          ? {
              id: current.id,
              // Coerce empty strings (local files with no tags) to undefined so
              // the watch renders its own placeholder rather than a blank line.
              title: current.title || undefined,
              artist: current.artist || undefined,
              album: current.album || undefined,
              durationMs,
            }
          : null,
        artworkKey: current?.artwork || null,
        isPlaying: snap.playing,
        positionMs: Math.round((snap.currentTime ?? 0) * 1000),
        sentAtEpochMs: Date.now(),
        shuffle: q.shuffle,
        repeatMode: q.repeatMode,
        canSeek: durationMs > 0,
      };
    };

    const pushState = (force = false) => {
      if (!hasWatch) return;
      const state = buildState();
      // sentAtEpochMs and positionMs move on every call; they are not part of
      // the signature or a paused phone would rewrite the item forever.
      const sig = [
        state.track?.id ?? "",
        state.isPlaying,
        state.shuffle,
        state.repeatMode,
        state.canSeek,
        state.track?.durationMs ?? 0,
      ].join("|");
      if (!force && sig === lastStateSig) return;
      lastStateSig = sig;
      WearBridge.putState(state);
    };

    const pushArtwork = async (force = false) => {
      if (!hasWatch) return;
      const key = useQueue.getState().getCurrent()?.artwork || null;
      if (!force && key === lastArtworkKey) return;
      lastArtworkKey = key;
      const epoch = publishEpoch;
      const fileUri = key ? await resolveArtworkFile(key) : null;
      if (cancelled || epoch !== publishEpoch) return;
      // A track change during the download makes this cover stale; the newer
      // push already ran and must win.
      if ((useQueue.getState().getCurrent()?.artwork || null) !== key) return;
      // A coverless track publishes an empty item rather than leaving the
      // previous one in place: the artwork item is what the watch tracks its
      // loaded cover by, so a stale one both keeps the wrong bitmap eligible and
      // suppresses the re-put when that same cover comes back on a later track.
      WearBridge.putArtwork({ key, fileUri });
    };

    const pushQueue = (force = false) => {
      if (!hasWatch) return;
      const q = useQueue.getState();
      const currentIndex = q.currentIndex ?? -1;
      // Only a window travels: a DataItem caps at 100KB and nobody scrolls 1000
      // rows on a watch.
      const anchor = currentIndex < 0 ? 0 : currentIndex;
      const baseIndex = Math.max(0, anchor - QUEUE_WINDOW_BEHIND);
      const tracks: QueueEntry[] = q.queue
        .slice(baseIndex, anchor + QUEUE_WINDOW_AHEAD + 1)
        .map((track) => ({
          id: track.id,
          title: track.title || undefined,
          artist: track.artist || undefined,
        }));
      const sig = `${baseIndex}:${currentIndex}:${q.queue.length}:${tracks
        .map((t) => t.id)
        .join("|")}`;
      if (!force && sig === lastQueueSig) return;
      lastQueueSig = sig;
      WearBridge.putQueue({
        v: PROTOCOL_VERSION,
        sig,
        baseIndex,
        currentIndex,
        total: q.queue.length,
        tracks,
      });
    };

    const pushProgress = () => {
      if (!hasWatch) return;
      if (Date.now() >= subscribedUntil) {
        // The lease ran out: the watch stopped renewing without its
        // `unsubscribe` ever arriving.
        stopProgressTimer();
        return;
      }
      const snap = getPlaybackSnapshot();
      WearBridge.sendProgress({
        v: PROTOCOL_VERSION,
        positionMs: Math.round((snap.currentTime ?? 0) * 1000),
        sentAtEpochMs: Date.now(),
        isPlaying: snap.playing,
      });
    };

    const stopProgressTimer = () => {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = null;
    };

    const syncProgressTimer = () => {
      const wanted = hasWatch && Date.now() < subscribedUntil;
      if (wanted && !progressTimer) {
        progressTimer = setInterval(pushProgress, PROGRESS_INTERVAL_MS);
      } else if (!wanted) {
        stopProgressTimer();
      }
    };

    /** Republish everything, ignoring the dedup signatures. */
    const resync = () => {
      lastTrackId = useQueue.getState().getCurrent()?.id ?? null;
      pushState(true);
      pushQueue(true);
      void pushArtwork(true);
    };

    // === discovery ===

    void WearBridge.getConnectedNodes().then((nodes) => {
      if (cancelled) return;
      hasWatch = nodes.length > 0;
      if (hasWatch) resync();
      syncProgressTimer();
    });

    const unsubConnection = WearBridge.onConnection((connected) => {
      hasWatch = connected;
      if (!connected) {
        subscribedUntil = 0;
        stopProgressTimer();
        return;
      }
      // A watch that just came back missed everything published while it was
      // away, and a freshly installed one has nothing at all.
      resync();
      syncProgressTimer();
    });

    // === outbound ===

    const unsubQueue = useQueue.subscribe((state, prev) => {
      const curId =
        state.currentIndex != null ? state.queue[state.currentIndex]?.id : null;
      if (curId !== lastTrackId) {
        lastTrackId = curId ?? null;
        pushState();
        void pushArtwork();
      }
      if (
        state.queue !== prev.queue ||
        state.currentIndex !== prev.currentIndex
      ) {
        pushQueue();
      }
      if (
        state.shuffle !== prev.shuffle ||
        state.repeatMode !== prev.repeatMode
      ) {
        pushState();
      }
    });

    const unsubPlayback = subscribePlaybackState(() => {
      pushState();
    });

    let lastScope = currentAuthScope();
    const unsubAuth = useAuthBase.subscribe(() => {
      const scope = currentAuthScope();
      if (scope === lastScope) return;
      lastScope = scope;
      // Covers and metadata from the previous server must not linger on the
      // watch — same isolation rule the rest of the persisted state follows.
      publishEpoch += 1;
      clearArtworkCache();
      WearBridge.clearState();
      lastTrackId = null;
      lastArtworkKey = null;
      lastQueueSig = null;
      lastStateSig = null;
      // Deliberately no resync here: this fires synchronously from the auth
      // store's set(), while the scoped stores are reset later from the
      // (app)/_layout effect. Republishing now would re-send the *outgoing*
      // server's queue and cover, undoing the clear above. That reset — and the
      // rehydrate that follows it — moves the queue, which the subscription
      // below turns into a push of the incoming scope's state.
    });

    // === inbound ===

    const unsubCommand = WearBridge.onCommand((command) => {
      switch (command.action) {
        case "play":
          play();
          break;
        case "pause":
          pause();
          break;
        case "next":
          skipNext();
          break;
        case "previous":
          skipPrevious();
          break;
        case "seek":
          seekTo(command.value / 1000);
          break;
        case "seekToIndex": {
          const index = Math.round(command.value);
          const q = useQueue.getState();
          if (q.queue[index]) playTracks(q.queue, index);
          break;
        }
        case "shuffle":
          useQueue.getState().setShuffle(command.value);
          break;
        case "repeat":
          useQueue.getState().setRepeatMode(command.value);
          break;
        case "subscribe": {
          // Also arrives as a heartbeat while the screen stays on, so only a
          // genuine off→on transition republishes; a renewal costs nothing.
          const renewal = Date.now() < subscribedUntil;
          subscribedUntil = Date.now() + SUBSCRIBE_TTL_MS;
          // The watch just opened its player; give it the truth immediately
          // rather than making it wait for the next change.
          if (!renewal) resync();
          syncProgressTimer();
          break;
        }
        case "unsubscribe":
          subscribedUntil = 0;
          stopProgressTimer();
          break;
        case "hello":
          hasWatch = true;
          resync();
          break;
      }
    });

    return () => {
      cancelled = true;
      stopProgressTimer();
      unsubConnection();
      unsubQueue();
      unsubPlayback();
      unsubAuth();
      unsubCommand();
    };
  }, []);

  return null;
}
