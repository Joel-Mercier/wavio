import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";
import { ping } from "@/services/backend/system";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

let currentType: NetInfoStateType = "unknown" as NetInfoStateType;
// Optimistic default — matches the previous per-component useIsOnline behavior
// of assuming online until the first NetInfo result arrives.
let isOnline = true;
// Whether the *active server* answered its last reachability probe. This is a
// separate axis from device connectivity: the device can be online (NetInfo
// isConnected) while the server is unreachable — e.g. its LAN IP changed after
// switching networks. Optimistic default so a cold start doesn't flash an
// "offline" UI before the first probe resolves.
let serverReachable = true;

// Probe deadline. Kept well under the axios request timeout so reachability is
// decided quickly rather than waiting on a real query.
const PROBE_TIMEOUT_MS = 4000;
// While the server is unreachable, re-probe on this cadence to detect recovery.
const RECOVERY_POLL_MS = 12000;
// While the server *is* reachable, probe on this (slower) cadence so a server
// that dies while the app sits open and foregrounded — no offline→online
// transition, no foreground event, no stream to fail — is still noticed instead
// of leaving the UI optimistically "online" until the next user action.
const HEARTBEAT_MS = 30000;
// A single failed probe right after reconnecting (or a brief server hiccup) is
// usually just the network not being routable yet, not the server being gone.
// Stay optimistically reachable and re-probe quickly after the first failure;
// only surface "unreachable" once this many consecutive probes have failed, so
// effective-online (and the offline banner) don't flicker on reconnect.
const FAILURES_BEFORE_UNREACHABLE = 2;
const QUICK_RETRY_MS = 2000;
// Consecutive failed probes (device online the whole time) before we conclude
// the server *might* be genuinely gone. NetInfo isConnected only means a link is
// attached, not that packets actually route (weak signal, captive/filtered
// networks) — so before logging out we corroborate against the wider internet
// (probeInternetReachable). A failure here means "device link attached but
// server unreachable"; the corroboration decides whether that's the server's
// fault (→ logout) or the link's (→ keep the session).
const DISCONNECT_AFTER_FAILURES = 3;
// Neutral endpoints used to corroborate that the wider internet — not just the
// active server — is reachable before force-logging-out. A single provider can
// be blocked or unreachable in a given region/network (e.g. Google in Russia),
// so we try a diverse set and only need ONE to answer to conclude "internet is
// up, the server specifically is down". If none answer, the device's own link is
// the problem and we keep the user signed in (issue #41). Order doesn't matter —
// they're raced in parallel.
const INTERNET_CHECK_URLS = [
  "https://www.cloudflare.com/cdn-cgi/trace",
  "https://captive.apple.com/hotspot-detect.html",
  "https://ya.ru/",
  "https://www.google.com/generate_204",
];
const INTERNET_CHECK_TIMEOUT_MS = 4000;
// A transport handoff (WiFi↔cellular/roaming) briefly reports isConnected=false
// before the new transport attaches. Don't flip the UI to offline on that first
// sample — wait out this grace window and only commit "offline" if the device is
// still disconnected, so a network switch doesn't flash the offline banner.
const OFFLINE_GRACE_MS = 2500;

const typeListeners = new Set<(type: NetInfoStateType) => void>();
const onlineListeners = new Set<() => void>();
const reachableListeners = new Set<() => void>();

let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let quickRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOfflineTimer: ReturnType<typeof setTimeout> | null = null;
let probeInFlight = false;
let consecutiveProbeFailures = 0;
let internetCheckInFlight = false;

export function getConnectionType(): NetInfoStateType {
  return currentType;
}

export function getIsOnline(): boolean {
  return isOnline;
}

export function getServerReachable(): boolean {
  return serverReachable;
}

// The value the app should treat as "online" for fetching/streaming: the device
// has connectivity AND the active server is reachable.
export function getIsEffectivelyOnline(): boolean {
  // The local library lives on-device: there's no server to reach and no
  // network round-trip to stream, so it's always effectively online regardless
  // of device connectivity (airplane mode still plays your on-disk library).
  if (useAuthBase.getState().serverType === "local") return true;
  return isOnline && serverReachable;
}

export function subscribeConnectionType(
  cb: (type: NetInfoStateType) => void,
): () => void {
  typeListeners.add(cb);
  return () => {
    typeListeners.delete(cb);
  };
}

// Parameterless callback to match the useSyncExternalStore contract — consumers
// read the current value via getIsOnline().
export function subscribeIsOnline(cb: () => void): () => void {
  onlineListeners.add(cb);
  return () => {
    onlineListeners.delete(cb);
  };
}

export function subscribeServerReachable(cb: () => void): () => void {
  reachableListeners.add(cb);
  return () => {
    reachableListeners.delete(cb);
  };
}

// Notified when *either* axis changes, so consumers of the effective state
// re-read getIsEffectivelyOnline().
export function subscribeEffectiveOnline(cb: () => void): () => void {
  onlineListeners.add(cb);
  reachableListeners.add(cb);
  return () => {
    onlineListeners.delete(cb);
    reachableListeners.delete(cb);
  };
}

function setServerReachable(value: boolean) {
  if (value === serverReachable) return;
  serverReachable = value;
  for (const cb of reachableListeners) cb();
  if (value) {
    stopRecoveryPoll();
  } else {
    // Unreachable now owns the polling: hand off from the heartbeat to the
    // faster recovery poll so we don't run two timers probing the same server.
    stopHeartbeat();
    startRecoveryPoll();
  }
}

function startRecoveryPoll() {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    void probeServer();
  }, RECOVERY_POLL_MS);
}

function stopRecoveryPoll() {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

// Steady-state poll while the server is reachable, so a server that goes away
// while the app is idle and foregrounded gets caught. Started from a successful
// probe; stopped once the server is confirmed unreachable (recovery poll takes
// over), when the device drops offline, or on logout / server switch.
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    void probeServer();
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// One-shot fast re-probe used during the grace window (after the first failure,
// before we've concluded the server is unreachable) so a real outage is still
// confirmed within a couple of seconds rather than waiting a full recovery poll.
function scheduleQuickReprobe() {
  if (quickRetryTimer) return;
  quickRetryTimer = setTimeout(() => {
    quickRetryTimer = null;
    void probeServer();
  }, QUICK_RETRY_MS);
}

function cancelQuickReprobe() {
  if (quickRetryTimer) {
    clearTimeout(quickRetryTimer);
    quickRetryTimer = null;
  }
}

function cancelPendingOffline() {
  if (pendingOfflineTimer) {
    clearTimeout(pendingOfflineTimer);
    pendingOfflineTimer = null;
  }
}

// Commit the device-offline transition once the grace window elapses with the
// device still disconnected. Effective-online is already false, so stop wasting
// a timer probing a server we definitely can't reach, and reset the failure
// count so a brief offline spell doesn't carry over and trigger an immediate
// logout once connectivity returns.
function commitOffline() {
  pendingOfflineTimer = null;
  if (!isOnline) return;
  isOnline = false;
  for (const cb of onlineListeners) cb();
  stopRecoveryPoll();
  stopHeartbeat();
  cancelQuickReprobe();
  consecutiveProbeFailures = 0;
}

// Pings the active server with a short deadline and updates serverReachable.
// No-ops when the device is offline (device connectivity dominates) or when no
// server is signed in. Safe to call repeatedly — overlapping probes are ignored.
export async function probeServer(): Promise<void> {
  if (probeInFlight) return;
  const { isAuthenticated, url, serverType } = useAuthBase.getState();
  // No server to ping for an on-device library — mark it reachable so the
  // disconnect-on-unreachable logic never fires for local.
  if (serverType === "local") {
    setServerReachable(true);
    return;
  }
  if (!isOnline) return;
  if (!isAuthenticated || !url) return;

  probeInFlight = true;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  // Hard deadline independent of the request. If a ping never settles — e.g. a
  // socket wedged by a network change that ignores the abort — `await ping`
  // could hang forever, leaving probeInFlight stuck true so every later probe
  // (including the recovery poll) no-ops and the offline banner freezes on
  // "server unreachable" with no failure count and no logout. The race
  // guarantees probeServer always settles and resets probeInFlight.
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new Error("probe deadline exceeded")),
      PROBE_TIMEOUT_MS + 1000,
    );
  });
  try {
    await Promise.race([ping({ signal: controller.signal }), deadline]);
    consecutiveProbeFailures = 0;
    cancelQuickReprobe();
    setServerReachable(true);
    // Keep probing on the slow heartbeat cadence so a later outage is noticed
    // even with no foreground / connectivity event to trigger a probe.
    // Idempotent, so repeated successful probes don't stack timers.
    startHeartbeat();
  } catch {
    consecutiveProbeFailures += 1;
    if (consecutiveProbeFailures >= FAILURES_BEFORE_UNREACHABLE) {
      // Confirmed: flip to unreachable (surfaces the banner, starts the
      // recovery poll). The recovery poll now owns re-probing.
      cancelQuickReprobe();
      setServerReachable(false);
    } else {
      // First failure — likely the network isn't routable yet right after a
      // reconnect. Stay optimistically reachable and re-probe quickly to confirm
      // before flipping the UI to "unreachable".
      scheduleQuickReprobe();
    }
    if (consecutiveProbeFailures >= DISCONNECT_AFTER_FAILURES) {
      void disconnectUnreachable();
    }
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(deadlineTimer);
    probeInFlight = false;
  }
}

// Races the neutral endpoints and resolves true as soon as ONE answers (any
// response — even a 4xx/5xx — proves we reached a server, so the internet is
// up). Resolves false only if every endpoint errors or the whole race times out,
// which means the device's own link is down/filtered. Never rejects.
function probeInternetReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let remaining = INTERNET_CHECK_URLS.length;
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      controller.abort();
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => settle(false), INTERNET_CHECK_TIMEOUT_MS);
    for (const url of INTERNET_CHECK_URLS) {
      fetch(url, { method: "HEAD", signal: controller.signal })
        .then(() => settle(true))
        .catch(() => {
          remaining -= 1;
          if (remaining === 0) settle(false);
        });
    }
  });
}

// Repeated probe failures while the device link is attached: the server *might*
// be gone, but a weak/restricted link looks identical from the app's side. Only
// force a logout once we've corroborated that the wider internet is reachable
// (so the server specifically is the failure). logout() clears credentials and
// the query cache. Reset our own state first so the next session starts
// optimistic.
async function disconnectUnreachable() {
  // Opt-out (stores/app.ts, default on): when disabled, never force a logout on
  // an unreachable server. Leave serverReachable=false (banner stays "server
  // unreachable", offline/cache mode active) and keep the recovery poll running
  // so the session auto-recovers once the server answers again.
  if (!useAppBase.getState().autoSignOutOnServerUnreachable) return;
  // Guard against overlapping internet checks from back-to-back recovery polls.
  if (internetCheckInFlight) return;
  internetCheckInFlight = true;
  let internetUp: boolean;
  try {
    internetUp = await probeInternetReachable();
  } finally {
    internetCheckInFlight = false;
  }
  // The device link can't reach anything (weak signal, captive/filtered network)
  // — it's the link that's down, not the server. Keep the user signed in; the
  // recovery poll stays running and restores things when connectivity returns.
  if (!internetUp) return;
  // Re-check after the async gap: the user may have toggled the setting, the
  // device may have dropped offline, or the server may have recovered.
  if (!useAppBase.getState().autoSignOutOnServerUnreachable) return;
  if (!isOnline || serverReachable) return;
  stopRecoveryPoll();
  stopHeartbeat();
  cancelQuickReprobe();
  cancelPendingOffline();
  consecutiveProbeFailures = 0;
  serverReachable = true;
  for (const cb of reachableListeners) cb();
  useAuthBase.getState().logout();
}

// Called on server switch: clear any unreachable state from the previous server
// so the new one starts optimistic, and stop the old recovery poll. A fresh
// probe should be kicked by the caller after the new credentials are in place.
export function resetServerReachable(): void {
  stopRecoveryPoll();
  stopHeartbeat();
  cancelQuickReprobe();
  cancelPendingOffline();
  consecutiveProbeFailures = 0;
  if (!serverReachable) {
    serverReachable = true;
    for (const cb of reachableListeners) cb();
  }
}

function applyState(state: NetInfoState) {
  const nextOnline = !!state.isConnected;
  if (state.type !== currentType) {
    const prevType = currentType;
    currentType = state.type;
    for (const cb of typeListeners) cb(currentType);
    // Transport handoff while staying online (e.g. WiFi→cellular): revalidate the
    // server on the new network now instead of waiting up to HEARTBEAT_MS. The
    // FAILURES_BEFORE_UNREACHABLE grace window absorbs a transient miss for a
    // remote server reachable on both transports; a LAN server that's genuinely
    // gone is caught promptly. Skip the very first event after cold start
    // (prevType "unknown") — auth/cache restore already kicks a probe there.
    if (
      nextOnline &&
      isOnline &&
      prevType !== ("unknown" as NetInfoStateType)
    ) {
      void probeServer();
    }
  }
  if (nextOnline) {
    // Connectivity is present: cancel any pending offline flip from a transient
    // drop during the handoff so the offline banner never flashes.
    cancelPendingOffline();
    if (!isOnline) {
      isOnline = true;
      for (const cb of onlineListeners) cb();
      // Regained device connectivity. Optimistically clear any stale unreachable
      // state carried over from before we dropped offline so the banner doesn't
      // flash "server unreachable" on reconnect, then re-probe to confirm — the
      // probe flips it back to false only if the server genuinely doesn't answer.
      consecutiveProbeFailures = 0;
      if (!serverReachable) {
        serverReachable = true;
        for (const cb of reachableListeners) cb();
      }
      void probeServer();
    }
  } else if (isOnline && !pendingOfflineTimer) {
    // NetInfo reports the device disconnected, but a transport handoff briefly
    // looks identical to going offline. Wait out the grace window before
    // committing — if connectivity returns first, cancelPendingOffline() above
    // means the UI never flickered offline.
    pendingOfflineTimer = setTimeout(commitOffline, OFFLINE_GRACE_MS);
  }
}

export function initConnectionType(): () => void {
  NetInfo.fetch().then(applyState);
  const unsubscribeNetInfo = NetInfo.addEventListener(applyState);
  // Switching to/from a local server flips the effective-online value even when
  // device connectivity and server reachability don't change (local is always
  // effectively online). Notify effective-online subscribers — onlineManager
  // and useIsOnline — so React Query resumes and track rows become tappable.
  let lastServerType = useAuthBase.getState().serverType;
  const unsubscribeAuth = useAuthBase.subscribe((state) => {
    if (state.serverType === lastServerType) return;
    lastServerType = state.serverType;
    for (const cb of onlineListeners) cb();
    for (const cb of reachableListeners) cb();
  });
  return () => {
    unsubscribeNetInfo();
    unsubscribeAuth();
  };
}

export function getEffectiveMaxBitRate(
  maxBitRate: number | null,
  cellularMaxBitRate: number | null,
): number | null {
  if (currentType !== "cellular") return maxBitRate;
  if (maxBitRate != null && cellularMaxBitRate != null) {
    return Math.min(maxBitRate, cellularMaxBitRate);
  }
  return cellularMaxBitRate ?? maxBitRate;
}
