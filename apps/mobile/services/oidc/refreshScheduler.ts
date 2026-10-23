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
import {
  activeOidcKey,
  REFRESH_MARGIN_MS,
  refreshOidcSession,
} from "@/services/oidc/session";
import { useAuthBase } from "@/stores/auth";
import { useOidcBase } from "@/stores/oidc";

// After a refresh that failed for a transient reason the expiry hasn't moved,
// so the next deadline is already in the past: wait this long instead of
// retrying in a tight loop against an IdP that's down.
const RETRY_AFTER_FAILURE_MS = 30_000;

/**
 * Refresh the active single-sign-on token ahead of expiry, while anything might
 * use it.
 *
 * Request-time refresh (services/oidc/session.ts) covers the axios clients, but
 * the player, image loader and downloader read the `Authorization` header
 * synchronously — ExoPlayer even keeps the one it was handed for every range
 * request of a track. So the token in the header map has to be fresh already.
 *
 * Gated like the recovery poll (services/recoveryPollGate.ts): foreground,
 * playing, or a car connected. A paused, backgrounded app refreshes nothing —
 * it catches up on the next request instead. Wired from index.js so a headless
 * Android Auto boot gets it too.
 */
export function startOidcRefreshScheduler(): () => void {
  let timer: BackgroundTimer | null = null;
  let retryNotBefore = 0;

  const present = () =>
    AppState.currentState !== "background" ||
    getPlaybackSnapshot().playing ||
    isCarConnected();

  const cancel = () => {
    if (timer !== null) {
      clearBackgroundTimer(timer);
      timer = null;
    }
  };

  const schedule = () => {
    cancel();
    const key = activeOidcKey();
    if (!key || !present()) return;
    const session = useOidcBase.getState().sessions[key];
    if (!session?.expiresAt || !session.refreshToken) return;
    const due = Math.max(
      session.expiresAt - REFRESH_MARGIN_MS,
      retryNotBefore,
      Date.now(),
    );
    timer = setBackgroundTimeout(async () => {
      timer = null;
      const before = useOidcBase.getState().sessions[key]?.expiresAt;
      await refreshOidcSession(key);
      const after = useOidcBase.getState().sessions[key]?.expiresAt;
      retryNotBefore =
        after === before ? Date.now() + RETRY_AFTER_FAILURE_MS : 0;
      schedule();
    }, due - Date.now());
  };

  const appState = AppState.addEventListener("change", schedule);
  const unsubscribePlayback = subscribePlaybackState(schedule);
  const unsubscribeCar = subscribeCarConnection(schedule);
  const unsubscribeAuth = useAuthBase.subscribe(schedule);
  const unsubscribeTokens = useOidcBase.subscribe(schedule);
  schedule();

  return () => {
    cancel();
    appState.remove();
    unsubscribePlayback();
    unsubscribeCar();
    unsubscribeAuth();
    unsubscribeTokens();
  };
}
