import { createBareClient, PROBE_TIMEOUT_MS } from "@/services/backend/probe";
import { reportBreadcrumb, reportError } from "@/services/errorReporting";
import { getIsOnline } from "@/services/network";
import {
  isCredentialErrorCode,
  subsonicAuthParams,
} from "@/services/openSubsonic/auth";
import { customHeadersForUrl } from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";

// Corroborated sign-out for Subsonic error 40.
//
// Subsonic code 40 nominally means "wrong username or password", and the app
// used to end the session the instant any response carried it. That is far too
// trusting: Navidrome answers 40 for *any* failure while looking the user up —
// a busy SQLite file, a password it couldn't decrypt, a context deadline — and a
// request that reaches it without its auth params (anything that mangles the
// query string in transit) gets the same 40 as a typo'd password. Home fires
// ~18 requests in its first second, so one bad answer out of that burst was
// enough to destroy a session whose credentials the login ping had validated
// seconds earlier, with no way back in (issue #171).
//
// So a 40 no longer decides anything on its own: it schedules a check. We ask
// the server directly, over a bare client, whether these credentials are still
// good, and only a server that keeps saying no ends the session.

const openSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const clientName = process.env.EXPO_PUBLIC_CLIENT_NAME || "Wavio";

// Two attempts, spaced, and both must be rejected before we sign anyone out.
// One ping is not enough: if a server only fails under load, the first attempt
// lands inside the very burst that produced the 40 and would be rejected too.
// The second lands after that burst has drained. A legitimate sign-out is
// therefore delayed by ~2s, which nobody notices.
const CORROBORATION_ATTEMPTS = 2;
const CORROBORATION_RETRY_DELAY_MS = 1500;
// After an inconclusive or spurious verdict, ignore further 40s for a while.
// React Query retries a failed query three times by default, so a server that
// answers 40 to everything produces ~4 responses per query across every query
// on screen — without this, each one would schedule its own round of pings.
const COOLDOWN_MS = 10000;

type Verdict = "ok" | "rejected" | "inconclusive";

// A session is only the same session if it's still signed in as the same user on
// the same server. Compared before acting on a verdict, since the ~2s of pings
// is long enough for the user to sign out or switch servers — and signing out a
// session the verdict was never about is exactly the bug we're fixing.
type SessionKey = { serverId: string; username: string };

let inFlight = false;
let cooldownUntil = 0;
// Endpoints already reported as spurious. A broken endpoint is retried every
// time the user returns to a screen that needs it, and each visit outlives the
// cooldown, so without this one bad endpoint files an Issue every few seconds
// for as long as the session lasts. Keyed by endpoint rather than latched
// outright, so a failure that later *spreads* to other endpoints still reports.
const reportedEndpoints = new Set<string>();
// How many 40s have arrived since the last verdict. Reported alongside the
// endpoint because it's the one number that separates "one flaky endpoint" from
// "this server rejects everything", which is otherwise unanswerable without
// server logs.
let burstCount = 0;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function sameSession(key: SessionKey): boolean {
  const { isAuthenticated, serverId, username } = useAuthBase.getState();
  return (
    isAuthenticated && serverId === key.serverId && username === key.username
  );
}

// Ask the server whether the current credentials are good. Bare client, so this
// never recurses through the interceptor that called us (see the doc block in
// services/backend/probe.ts).
async function pingCredentials(url: string): Promise<Verdict> {
  try {
    const response = await createBareClient(
      url,
      PROBE_TIMEOUT_MS,
      customHeadersForUrl(url),
    ).get("/rest/ping", {
      params: {
        ...subsonicAuthParams(),
        v: openSubsonicApiVersion,
        c: clientName,
        f: "json",
      },
    });
    const envelope = response.data?.["subsonic-response"];
    if (envelope?.status === "ok") return "ok";
    return isCredentialErrorCode(envelope?.error?.code)
      ? "rejected"
      : "inconclusive";
  } catch {
    // Timeout, DNS failure, refused connection, a non-Subsonic body: the server
    // didn't tell us anything about the credentials. Never a reason to sign out
    // — offline and unreachable-server handling lives in services/network.ts.
    return "inconclusive";
  }
}

async function corroborate(
  url: string,
  key: SessionKey,
  endpoint: string | undefined,
): Promise<void> {
  for (let attempt = 1; attempt <= CORROBORATION_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CORROBORATION_RETRY_DELAY_MS);
    if (!sameSession(key)) return;
    const verdict = await pingCredentials(url);
    if (verdict === "ok") {
      // The credentials are fine and the failing request was not about them.
      // Keep the session and report it: this is the case that has been
      // invisible in Sentry, because a code 40 is reported nowhere else.
      const key = endpoint ?? "(unknown)";
      if (!reportedEndpoints.has(key)) {
        reportedEndpoints.add(key);
        reportError(
          {
            code: 40,
            message: "Subsonic error 40 on a session the server still accepts",
          },
          {
            area: "auth",
            backend: "subsonic",
            endpoint,
            extra: { verdict: "spurious", attempt, burstCount },
          },
        );
      }
      cooldownUntil = Date.now() + COOLDOWN_MS;
      burstCount = 0;
      return;
    }
    if (verdict === "inconclusive") {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      burstCount = 0;
      return;
    }
  }

  if (!sameSession(key)) return;
  reportBreadcrumb("auth", "subsonic-credentials-rejected", {
    endpoint: endpoint ?? null,
    burstCount,
  });
  burstCount = 0;
  cooldownUntil = 0;
  // A real credential failure — a password changed on the server, a deleted
  // user. Deliberately not reported to Sentry: it's the user's to fix, not ours.
  useAuthBase.getState().logout();
}

/**
 * Record that a Subsonic request came back with error 40, and decide — out of
 * band — whether that means the session is over.
 *
 * Fire-and-forget: returns immediately, never throws, and at most one
 * corroboration round runs at a time.
 */
export function noteSubsonicAuthFailure(endpoint?: string): void {
  const { isAuthenticated, url, serverType, serverId, username } =
    useAuthBase.getState();
  // Nothing to corroborate: no session, no server, or an on-device library that
  // has no server to ask.
  if (!isAuthenticated || !url || serverType === "local") return;

  burstCount += 1;
  reportBreadcrumb("auth", "subsonic-auth-failed", {
    endpoint: endpoint ?? null,
    burstCount,
  });

  if (inFlight || Date.now() < cooldownUntil) return;
  // Offline: the ping can only fail, which tells us nothing. Keep the session —
  // offline mode depends on it.
  if (!getIsOnline()) return;

  inFlight = true;
  void corroborate(url, { serverId, username }, endpoint).finally(() => {
    inFlight = false;
  });
}

// Test seam: the module keeps burst/cooldown state across calls by design.
export function __resetCredentialFailureState(): void {
  inFlight = false;
  cooldownUntil = 0;
  burstCount = 0;
  reportedEndpoints.clear();
}
