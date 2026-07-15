import axios, { type AxiosInstance } from "axios";
import { buildAuthorizationHeader } from "@/services/jellyfin/index";
import { encodePasswordParam } from "@/services/openSubsonic/auth";
import { useAuthBase } from "@/stores/auth";

// Reachability probe for one specific server URL, used by the failover in
// services/network.ts to decide which of a server's routes to talk to.
//
// Takes the URL as a parameter but reads credentials from the store: a probe
// only runs for a signed-in session, and a server's primary and fallback are two
// routes to the *same* server, so the credentials are identical by construction.

const openSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const clientName = process.env.EXPO_PUBLIC_CLIENT_NAME || "Wavio";

// Deadline for a single candidate. Kept well under the axios instances' 15s
// timeout so reachability is decided quickly rather than waiting on a real query.
export const PROBE_TIMEOUT_MS = 4000;
// Hard backstop, independent of the request. A socket wedged by a network change
// can ignore the abort and never settle; without this the caller's in-flight
// guard would stick forever and every later probe would no-op.
const PROBE_DEADLINE_MS = PROBE_TIMEOUT_MS + 1000;

/**
 * A throwaway axios client bound to one explicit base URL, with none of the
 * shared instances' interceptors.
 *
 * Bare is a hard requirement for probing, not a convenience: the shared
 * instances log the user out on a Subsonic error 40 (openSubsonic/index.ts) or
 * an HTTP 401 (jellyfin/index.ts). Probing a fallback that sits behind an SSO
 * proxy, or whose credentials differ, would otherwise end the session instead of
 * simply reporting "not usable".
 */
export function createBareClient(
  baseURL: string,
  timeout?: number,
): AxiosInstance {
  return axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    ...(timeout ? { timeout } : {}),
  });
}

// Reachable iff the server answers with a valid, authenticated envelope.
//
// "Any HTTP response" is deliberately NOT enough. On a foreign network a LAN
// address like http://192.168.1.10:4533 frequently *does* answer — a router
// admin page, an IP camera, another tenant's NAS — and treating that as reachable
// would pin the whole app to it. The same hazard is documented for login in
// services/auth/authenticate.ts. Requiring the envelope also means a route whose
// credentials don't work there (error 40 / 401) is refused rather than adopted.
async function probeSubsonic(
  url: string,
  signal: AbortSignal,
): Promise<boolean> {
  const { username, subsonicSalt, subsonicToken, password, useTokenAuth } =
    useAuthBase.getState();
  // Send exactly one mechanism — supplying both `p` and `t`/`s` triggers error
  // 43. Mirrors the interceptor's split in services/openSubsonic/index.ts.
  const authParams =
    useTokenAuth === false
      ? { u: username, p: encodePasswordParam(password) }
      : { u: username, t: subsonicToken, s: subsonicSalt };
  const response = await createBareClient(url).get("/rest/ping", {
    signal,
    params: {
      ...authParams,
      v: openSubsonicApiVersion,
      c: clientName,
      f: "json",
    },
  });
  return response.data?.["subsonic-response"]?.status === "ok";
}

// `/System/Info` (authenticated), not `/System/Info/Public`: the authenticated
// variant additionally proves the access token is honored on *this* hostname,
// which is the open question when a server has two routes.
async function probeJellyfin(
  url: string,
  signal: AbortSignal,
): Promise<boolean> {
  const { jellyfinAccessToken } = useAuthBase.getState();
  const response = await createBareClient(url.replace(/\/+$/, "")).get(
    "/System/Info",
    {
      signal,
      headers: {
        "X-Emby-Authorization": buildAuthorizationHeader(jellyfinAccessToken),
        ...(jellyfinAccessToken ? { "X-Emby-Token": jellyfinAccessToken } : {}),
      },
    },
  );
  return response.status === 200 && !!response.data?.Version;
}

/**
 * Whether `url` is a usable route to the active server right now.
 *
 * Never throws and never reports to Sentry — a failing candidate is an expected
 * outcome on a timer that runs every 12-30s. Always settles.
 */
export async function probeUrl(url: string): Promise<boolean> {
  const { serverType } = useAuthBase.getState();
  if (!url || serverType === "local") return false;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    deadlineTimer = setTimeout(() => resolve(false), PROBE_DEADLINE_MS);
  });
  try {
    return await Promise.race([
      serverType === "jellyfin"
        ? probeJellyfin(url, controller.signal)
        : probeSubsonic(url, controller.signal),
      deadline,
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(deadlineTimer);
  }
}
