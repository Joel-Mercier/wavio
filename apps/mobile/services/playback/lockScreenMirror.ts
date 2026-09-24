import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  type BackgroundTimer,
  clearBackgroundTimer,
  setBackgroundInterval,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";
import {
  activeRemoteTarget,
  subscribeRemoteChange,
} from "@/services/playback/targets";
import { getActivePlayer, pushLockScreenMetadata } from "@/services/player";
import useQueue from "@/stores/queue";

// A remote reports its position every 1-3s at best, and only when something
// changes; without a pulse the notification's seek bar would sit still between
// track changes. Matches the cadence services/carAuto/session.ts uses to keep
// Android Auto's timeline moving.
const PUSH_INTERVAL_MS = 1000;
// On a cold start straight into a session handed back by its SDK (a Chromecast
// still playing after the app was killed), the claim lands before the playback
// service is bound and is dropped on the floor; the native side is a no-op once
// set, so it is simply said again while the service comes up.
const RECLAIM_DELAYS_MS = [1500, 4000];

/**
 * Keeps the OS media controls in sync with playback that is happening somewhere
 * other than this device — a Subsonic jukebox, a UPnP renderer.
 *
 * The lock screen is otherwise fed only from `loadTrack`, which never runs while
 * a remote target owns playback, so the notification would keep showing the
 * track the local engine last loaded and its play button would start that track
 * on the phone's own speaker (issue #179).
 *
 * The metadata still goes through the normal `applyLockScreen` path, so the
 * artwork mirroring and offline cover fallbacks apply unchanged; only the
 * transport state comes from the remote.
 */
export function startLockScreenMirror() {
  let pulse: BackgroundTimer | null = null;
  let remoteActive = false;
  let lastTrackId: string | null = null;
  let reclaims: BackgroundTimer[] = [];

  const cancelReclaims = () => {
    for (const timer of reclaims) clearBackgroundTimer(timer);
    reclaims = [];
  };

  const pushState = () => {
    if (!remoteActive) return;
    // Read the target directly rather than the cached snapshot: nothing refreshes
    // that cache while the app is backgrounded (its ticker only runs for mounted
    // progress subscribers), so the pulse would republish a stale position with a
    // fresh timestamp and the notification's seek bar would creep then snap back.
    const target = activeRemoteTarget();
    const snap = target?.readSnapshot() ?? getPlaybackSnapshot();
    try {
      getActivePlayer().updateRemotePlayback(
        snap.playing,
        Math.round((snap.currentTime ?? 0) * 1000),
        Math.round((snap.duration ?? 0) * 1000),
      );
      // Rides on the same pulse: the session claims the hardware volume keys
      // for the remote and needs the remote's volume to step from.
      const volume = target?.getVolume?.();
      if (volume != null) getActivePlayer().setRemoteVolume(volume);
    } catch {
      // The controls are a nicety; never let them break playback.
    }
  };

  // Metadata first: on a cold start straight into a jukebox session the controls
  // aren't up yet, and this is what raises them. Re-asserted on every track
  // change because emptying the queue tears the controls down (and with them the
  // native remote flag), and the queue can be refilled without ever leaving the
  // remote output.
  const assertRemote = () => {
    const current = useQueue.getState().getCurrent();
    lastTrackId = current?.id ?? null;
    try {
      pushLockScreenMetadata(current);
      if (current) getActivePlayer().setRemotePlayback(true);
    } catch {
      // Same as above.
    }
    cancelReclaims();
    if (!current) return;
    reclaims = RECLAIM_DELAYS_MS.map((delay) =>
      setBackgroundTimeout(() => {
        if (!remoteActive || lastTrackId !== current.id) return;
        try {
          getActivePlayer().setRemotePlayback(true);
        } catch {
          // Same as above.
        }
      }, delay),
    );
  };

  const syncTarget = () => {
    const active = !!activeRemoteTarget();
    if (active === remoteActive) return;
    remoteActive = active;
    if (active) {
      assertRemote();
      pushState();
      if (!pulse) pulse = setBackgroundInterval(pushState, PUSH_INTERVAL_MS);
      return;
    }
    cancelReclaims();
    try {
      getActivePlayer().setRemotePlayback(false);
    } catch {
      // Same as above.
    }
    // Handing back needs no metadata push — takeOverFromRemote loads the track
    // locally, which drives applyLockScreen the usual way.
    lastTrackId = null;
    if (pulse) {
      clearBackgroundTimer(pulse);
      pulse = null;
    }
  };

  subscribeRemoteChange(() => {
    syncTarget();
    pushState();
  });

  subscribePlaybackState(pushState);

  useQueue.subscribe(() => {
    if (!remoteActive) return;
    const id = useQueue.getState().getCurrent()?.id ?? null;
    if (id === lastTrackId) return;
    assertRemote();
    pushState();
  });

  syncTarget();
}
