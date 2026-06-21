import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";
import { ping } from "@/services/backend/system";
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
// the server is genuinely gone and log the user out. A failure here always means
// "device online but server unreachable" (probeServer no-ops while offline), so
// it's distinct from being offline.
const DISCONNECT_AFTER_FAILURES = 3;

const typeListeners = new Set<(type: NetInfoStateType) => void>();
const onlineListeners = new Set<() => void>();
const reachableListeners = new Set<() => void>();

let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let quickRetryTimer: ReturnType<typeof setTimeout> | null = null;
let probeInFlight = false;
let consecutiveProbeFailures = 0;

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
      disconnectUnreachable();
    }
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(deadlineTimer);
    probeInFlight = false;
  }
}

// Server confirmed gone (online the whole time, repeated probe failures): log
// out so the user lands on the login/server screen rather than staring at stale
// cache. logout() clears credentials and the query cache. Reset our own state
// first so the next session starts optimistic.
function disconnectUnreachable() {
  stopRecoveryPoll();
  stopHeartbeat();
  cancelQuickReprobe();
  consecutiveProbeFailures = 0;
  if (!serverReachable) {
    serverReachable = true;
    for (const cb of reachableListeners) cb();
  }
  useAuthBase.getState().logout();
}

// Called on server switch: clear any unreachable state from the previous server
// so the new one starts optimistic, and stop the old recovery poll. A fresh
// probe should be kicked by the caller after the new credentials are in place.
export function resetServerReachable(): void {
  stopRecoveryPoll();
  stopHeartbeat();
  cancelQuickReprobe();
  consecutiveProbeFailures = 0;
  if (!serverReachable) {
    serverReachable = true;
    for (const cb of reachableListeners) cb();
  }
}

function applyState(state: NetInfoState) {
  if (state.type !== currentType) {
    currentType = state.type;
    for (const cb of typeListeners) cb(currentType);
  }
  const nextOnline = !!state.isConnected;
  if (nextOnline !== isOnline) {
    isOnline = nextOnline;
    for (const cb of onlineListeners) cb();
    if (nextOnline) {
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
    } else {
      // Device offline: effective-online is already false, so stop wasting a
      // timer probing a server we definitely can't reach. Reset the failure
      // count so a brief offline spell doesn't carry over and trigger an
      // immediate logout once connectivity returns.
      stopRecoveryPoll();
      stopHeartbeat();
      cancelQuickReprobe();
      consecutiveProbeFailures = 0;
    }
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
