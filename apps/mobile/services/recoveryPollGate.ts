import { AppState } from "react-native";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  type BackgroundTimer,
  clearBackgroundTimer,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";
import {
  isCarConnected,
  subscribeCarConnection,
} from "@/services/carAuto/connection";
import { setRecoveryPollEnabled } from "@/services/network";

// `playing` drops for a moment at every track change, and each re-enable probes
// at once — without this grace a backgrounded queue pinged the server once per
// track (measured on device).
const IDLE_GRACE_MS = 15000;

// The unreachable-server recovery poll runs on a background timer so a drive
// recovers after a tunnel, but a paused, backgrounded app has nobody to recover
// for: it would ping a dead server every 12 s indefinitely. Wired from index.js
// so a headless car boot gets it too.
export function startRecoveryPollGate(): () => void {
  let enabled: boolean | null = null;
  let idleTimer: BackgroundTimer | null = null;

  // Only a definite "background" counts as away: an unknown state at boot or
  // iOS's transient "inactive" keeps the previous always-on behaviour.
  const present = () =>
    AppState.currentState !== "background" ||
    getPlaybackSnapshot().playing ||
    isCarConnected();

  const apply = (next: boolean) => {
    if (next === enabled) return;
    enabled = next;
    setRecoveryPollEnabled(next);
  };

  const cancelIdle = () => {
    if (idleTimer) {
      clearBackgroundTimer(idleTimer);
      idleTimer = null;
    }
  };

  const update = () => {
    if (present()) {
      cancelIdle();
      apply(true);
      return;
    }
    if (enabled === null) {
      apply(false);
      return;
    }
    if (!enabled || idleTimer) return;
    idleTimer = setBackgroundTimeout(() => {
      idleTimer = null;
      if (!present()) apply(false);
    }, IDLE_GRACE_MS);
  };

  const appState = AppState.addEventListener("change", update);
  const unsubscribePlayback = subscribePlaybackState(update);
  const unsubscribeCar = subscribeCarConnection(update);
  update();

  return () => {
    cancelIdle();
    appState.remove();
    unsubscribePlayback();
    unsubscribeCar();
  };
}
