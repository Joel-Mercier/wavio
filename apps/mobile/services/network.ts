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
// Consecutive failed probes (device online the whole time) before we conclude
// the server is genuinely gone and log the user out. Tolerates transient blips
// (server restart, brief network change) — at RECOVERY_POLL_MS cadence this is
// ~24s. A failure here always means "device online but server unreachable"
// (probeServer no-ops while offline), so it's distinct from being offline.
const DISCONNECT_AFTER_FAILURES = 3;

const typeListeners = new Set<(type: NetInfoStateType) => void>();
const onlineListeners = new Set<() => void>();
const reachableListeners = new Set<() => void>();

let recoveryTimer: ReturnType<typeof setInterval> | null = null;
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

// Pings the active server with a short deadline and updates serverReachable.
// No-ops when the device is offline (device connectivity dominates) or when no
// server is signed in. Safe to call repeatedly — overlapping probes are ignored.
export async function probeServer(): Promise<void> {
  if (probeInFlight) return;
  if (!isOnline) return;
  const { isAuthenticated, url } = useAuthBase.getState();
  if (!isAuthenticated || !url) return;

  probeInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await ping({ signal: controller.signal });
    consecutiveProbeFailures = 0;
    setServerReachable(true);
  } catch {
    consecutiveProbeFailures += 1;
    setServerReachable(false);
    if (consecutiveProbeFailures >= DISCONNECT_AFTER_FAILURES) {
      disconnectUnreachable();
    }
  } finally {
    clearTimeout(timer);
    probeInFlight = false;
  }
}

// Server confirmed gone (online the whole time, repeated probe failures): log
// out so the user lands on the login/server screen rather than staring at stale
// cache. logout() clears credentials and the query cache. Reset our own state
// first so the next session starts optimistic.
function disconnectUnreachable() {
  stopRecoveryPoll();
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
      // Regained device connectivity — confirm the server is actually reachable.
      void probeServer();
    } else {
      // Device offline: effective-online is already false, so stop wasting a
      // timer probing a server we definitely can't reach. Reset the failure
      // count so a brief offline spell doesn't carry over and trigger an
      // immediate logout once connectivity returns.
      stopRecoveryPoll();
      consecutiveProbeFailures = 0;
    }
  }
}

export function initConnectionType(): () => void {
  NetInfo.fetch().then(applyState);
  return NetInfo.addEventListener(applyState);
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
