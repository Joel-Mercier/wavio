import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";
import { probeUrl } from "@/services/backend/probe";
import { reportBreadcrumb, scrubUrl } from "@/services/errorReporting";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import { useServersBase } from "@/stores/servers";

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

// While the server is unreachable, re-probe on this cadence to detect recovery.
// This poll never gives up: a route that comes back is adopted on the next tick
// with no user action. (Other clients that stop retrying after a few attempts
// strand the user on a "server offline" screen until they force a refresh.)
const RECOVERY_POLL_MS = 12000;
// While the server *is* reachable, probe on this (slower) cadence so a server
// that dies while the app sits open and foregrounded — no offline→online
// transition, no foreground event, no stream to fail — is still noticed instead
// of leaving the UI optimistically "online" until the next user action.
const HEARTBEAT_MS = 30000;
// A single failed probe round right after reconnecting (or a brief server
// hiccup) is usually just the network not being routable yet, not the server
// being gone. Stay optimistically reachable and re-probe quickly after the first
// failure; only surface "unreachable" once this many consecutive rounds have
// failed, so effective-online (and the offline banner) don't flicker on
// reconnect.
const FAILURES_BEFORE_UNREACHABLE = 2;
const QUICK_RETRY_MS = 2000;
// While pinned to the fallback, only re-check the primary on events that could
// plausibly mean "you're home again" — a transport change, a reconnect, an app
// foreground — never on the steady heartbeat, and at most this often. Foreground
// events in particular arrive in flurries (iOS fires `active` when a
// control-centre pull or a permission dialog is dismissed), and each unthrottled
// re-check would burn a full probe timeout on a LAN address that isn't there.
const PRIMARY_RECHECK_MIN_INTERVAL_MS = 60000;
// Consecutive failed probe rounds (device online the whole time) before we
// conclude the server *might* be genuinely gone. NetInfo isConnected only means a link is
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
let lastPrimaryRecheckAt = 0;

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

// The routes to try this round, best-first.
//
// A server with no fallback yields exactly one candidate — the active URL — so
// every timing and counter below behaves identically to before this feature
// existed. That equivalence is the point: failover must not change the
// single-route case at all.
function orderCandidates(preferPrimary: boolean): string[] {
  const { serverId, url } = useAuthBase.getState();
  const server = useServersBase.getState().getServerById(serverId);
  const primary = server?.url;
  const fallback = server?.fallbackUrl;
  if (!primary || !fallback) return [url];
  // The primary is preferred whenever we have a reason to think it might work:
  // it's normally the LAN route, which is faster and doesn't round-trip through
  // the user's upload bandwidth.
  const onPrimary = url === primary;
  return onPrimary || preferPrimary ? [primary, fallback] : [fallback, primary];
}

/**
 * Try each of the active server's routes and update serverReachable.
 *
 * The unit of work is a *round*, not a single ping: `consecutiveProbeFailures`
 * counts rounds in which **no** route answered. That keeps the two existing
 * gates (FAILURES_BEFORE_UNREACHABLE, DISCONNECT_AFTER_FAILURES) meaningful
 * unchanged — the banner and the forced sign-out only ever fire when the server
 * is unreachable by every route we know.
 *
 * Candidates are tried sequentially rather than raced: racing would double the
 * request volume on every heartbeat forever, and a double answer would be
 * resolved in the primary's favour anyway. Sequential costs nothing in the happy
 * path, where the first candidate answers.
 *
 * No-ops when the device is offline (device connectivity dominates) or when no
 * server is signed in. Safe to call repeatedly — overlapping rounds are ignored.
 */
export async function probeServer({
  preferPrimary = false,
}: {
  preferPrimary?: boolean;
} = {}): Promise<void> {
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
  try {
    // probeUrl owns its own deadline and never throws, so a round always
    // settles and probeInFlight can't wedge.
    for (const candidate of orderCandidates(preferPrimary)) {
      if (!(await probeUrl(candidate))) continue;
      if (candidate !== useAuthBase.getState().url) {
        adoptRoute(candidate);
      }
      consecutiveProbeFailures = 0;
      cancelQuickReprobe();
      setServerReachable(true);
      // Keep probing on the slow heartbeat cadence so a later outage is noticed
      // even with no foreground / connectivity event to trigger a probe.
      // Idempotent, so repeated successful rounds don't stack timers.
      startHeartbeat();
      return;
    }
    // Nothing answered.
    consecutiveProbeFailures += 1;
    if (consecutiveProbeFailures >= FAILURES_BEFORE_UNREACHABLE) {
      // Confirmed: flip to unreachable (surfaces the banner, starts the
      // recovery poll). The recovery poll now owns re-probing.
      cancelQuickReprobe();
      setServerReachable(false);
    } else {
      // First failed round — likely the network isn't routable yet right after a
      // reconnect. Stay optimistically reachable and re-probe quickly to confirm
      // before flipping the UI to "unreachable".
      scheduleQuickReprobe();
    }
    if (consecutiveProbeFailures >= DISCONNECT_AFTER_FAILURES) {
      void disconnectUnreachable();
    }
  } finally {
    probeInFlight = false;
  }
}

// Point the session at a different route for the same server. Only `url` moves:
// the storage scope is keyed on the server id, so nothing rehydrates and the
// queue, downloads and cache stay exactly where they are.
function adoptRoute(url: string): void {
  const from = useAuthBase.getState().url;
  useAuthBase.getState().setActiveUrl(url);
  reportBreadcrumb("network", "route-swap", {
    from: scrubUrl(from),
    to: scrubUrl(url),
  });
}

// Should this trigger try the primary first? Bounded by
// PRIMARY_RECHECK_MIN_INTERVAL_MS; when throttled the caller still probes, just
// without reordering — reachability of the current route still needs confirming.
function shouldRecheckPrimary(): boolean {
  const now = Date.now();
  if (now - lastPrimaryRecheckAt < PRIMARY_RECHECK_MIN_INTERVAL_MS)
    return false;
  lastPrimaryRecheckAt = now;
  return true;
}

/**
 * Probe triggered by an event that might mean the primary route is usable again
 * (a transport change, a reconnect, an app foreground). This is the *only* way
 * back to the primary once we're on the fallback — the heartbeat deliberately
 * never re-checks it, so a LAN address that isn't there costs nothing while
 * you're away.
 */
export function probeServerPreferringPrimary(): void {
  void probeServer({ preferPrimary: shouldRecheckPrimary() });
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
  // A new server gets a fresh primary re-check budget; the previous server's
  // throttle must not suppress the first one.
  lastPrimaryRecheckAt = 0;
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
    //
    // This is also the handoff that carries you off the LAN (and back onto it),
    // so it's the main trigger that re-checks the primary route.
    if (
      nextOnline &&
      isOnline &&
      prevType !== ("unknown" as NetInfoStateType)
    ) {
      probeServerPreferringPrimary();
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
      // Connectivity is back, possibly on a different network — the primary may
      // be reachable again.
      probeServerPreferringPrimary();
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
