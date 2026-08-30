import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import i18n from "@/config/i18n";
import { noteSubsonicAuthFailure } from "@/services/auth/credentialFailure";
import { DYNAMIC_CAPABILITY_ENDPOINTS } from "@/services/backend/capabilities";
import { reportError, UNSUPPORTED_METHOD_RE } from "@/services/errorReporting";
import { noteServerVersion } from "@/services/navidromeIdMigration/detect";
import { USER_AGENT } from "@/services/network";
import { subsonicAuthParams } from "@/services/openSubsonic/auth";
import type { ResponseStatus } from "@/services/openSubsonic/types";
import { customHeadersForUrl } from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";
import { useCapabilityOverridesBase } from "@/stores/capabilityOverrides";

const openSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const clientName = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

if (__DEV__) {
  console.log("[app] OpenSubsonic API Version : ", openSubsonicApiVersion);
  console.log("[app] Client : ", clientName);
}

export type OpenSubsonicResponse<T> = {
  "subsonic-response": {
    status: ResponseStatus;
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: OpenSubsonicErrorResponse;
  } & T;
};

export type OpenSubsonicErrorResponse = {
  code: number;
  message?: string;
  helpUrl?: string;
};

const openSubsonicApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the server is unreachable (e.g. its LAN IP changed) instead
  // of hanging on the OS TCP timeout. The reachability probe enforces its own
  // shorter deadline on top of this (see services/network.ts).
  timeout: 15000,
});

openSubsonicApiInstance.interceptors.request.use(
  (request) => {
    const { url } = useAuthBase.getState();
    request.params = {
      ...(request.params ?? {}),
      ...subsonicAuthParams(),
      v: openSubsonicApiVersion,
      c: clientName,
      f: "json",
    };
    request.baseURL = url || request.baseURL || "";
    request.headers.set("User-Agent", USER_AGENT);
    // Applied last: a server behind an authenticating proxy needs these on
    // every request, and the user's value wins on the (rare) name collision —
    // overriding the User-Agent a WAF rejects is a legitimate use.
    const custom = customHeadersForUrl(request.baseURL);
    if (custom) {
      for (const [name, value] of Object.entries(custom)) {
        request.headers.set(name, value);
      }
    }
    return request;
  },
  (error) => Promise.reject(error),
);

// A server says "I don't implement this endpoint" two ways: an HTTP 501, or —
// per the Subsonic wire protocol — HTTP 200 carrying envelope code 0 "Method not
// supported". Both mean the same thing, so both flip the matching capability off
// (persisted per server+user) and the UI stops offering the feature instead of
// failing again: Navidrome ships sharing/jukebox off by default, and not every
// OpenSubsonic server hosts podcasts or the song-list endpoints.
function noteUnsupportedEndpoint(url: string | undefined) {
  const capability = DYNAMIC_CAPABILITY_ENDPOINTS[url ?? ""];
  if (capability) {
    useCapabilityOverridesBase.getState().disableCapability(capability);
  }
}

// Code 0 is Subsonic's generic error, so only the message separates a missing
// method from a real failure — and each implementation phrases it its own way
// ("Method not supported: x", "Unsupported request: x"). The regex is shared
// with services/errorReporting.ts, which matches the same shape to keep it out
// of Sentry: a phrasing only one of them recognises either leaks noise or leaves
// the capability enabled forever.
function isMethodNotSupported(error: OpenSubsonicErrorResponse) {
  return (
    error.code === 0 &&
    typeof error.message === "string" &&
    UNSUPPORTED_METHOD_RE.test(error.message)
  );
}

openSubsonicApiInstance.interceptors.response.use(
  (response) => {
    const envelope = response.data?.["subsonic-response"];
    const version = envelope?.serverVersion;
    if (typeof version === "string" && version.length > 0) {
      const current = useAuthBase.getState().serverVersion;
      if (current !== version) {
        useAuthBase.getState().setServerVersion(version);
      }
      // Navidrome's canonical-id migration renumbers most song ids server-side.
      // This records the version and, when it may have happened, freezes the
      // reconcilers that would read our stored ids as deleted content.
      noteServerVersion(version, envelope?.type);
    }
    // Subsonic error code 40 nominally means "wrong username or password", but
    // servers hand it out for much more than that (see the doc block in
    // services/auth/credentialFailure.ts), so it doesn't end the session on its
    // own: it schedules a check that asks the server again before signing out.
    // Network errors never reach here at all — offline mode depends on the user
    // staying signed in. Note the Jellyfin client still logs out on any HTTP 401
    // (services/jellyfin/index.ts); its 401 is far less overloaded than this.
    if (envelope?.status === "failed" && envelope?.error?.code === 40) {
      noteSubsonicAuthFailure(response.config?.url);
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 501) {
      noteUnsupportedEndpoint(error?.config?.url);
    }
    // The classifier drops offline / unreachable-server / cancelled / 501 noise
    // and reports only genuine HTTP failures (4xx/5xx with a response body).
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: error?.config?.url,
    });
    return Promise.reject(error);
  },
);

const KNOWN_ERROR_CODES = [10, 20, 30, 40, 41, 42, 43, 44, 50, 60, 70] as const;
const knownErrorCodeSet: ReadonlySet<number> = new Set(KNOWN_ERROR_CODES);

// Proxy so translations resolve against the *current* locale at lookup time
// rather than at module-init time (when i18n may not be ready yet, and which
// wouldn't pick up runtime locale changes).
export const openSubsonicErrorCodes = new Proxy({} as Record<number, string>, {
  get(_target, prop) {
    const code = Number(prop);
    if (!knownErrorCodeSet.has(code)) return undefined;
    return i18n.t(`openSubsonic.errorCodes.${code}`);
  },
});

export type ApiType = typeof openSubsonicApiInstance;

// Subsonic error code 70 = "the requested data was not found". For a browse
// scoped to a music folder it means the folder is empty or no longer maps to a
// library — a data state the caller can resolve to an empty result.
export const SUBSONIC_DATA_NOT_FOUND = 70;

// Subsonic error code 50 = "user is not authorized for the given operation".
// Navidrome returns it for admin-only endpoints (e.g. startScan) when a
// non-admin calls them — an expected outcome the caller can explain, not a bug.
export const SUBSONIC_NOT_AUTHORIZED = 50;

export function isSubsonicDataNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: number }).code === SUBSONIC_DATA_NOT_FOUND
  );
}

export function isSubsonicNotAuthorized(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: number }).code === SUBSONIC_NOT_AUTHORIZED
  );
}

// Wrap a payload in an "ok" subsonic-response envelope so a caller can resolve a
// "not found" into an empty success, letting the UI show an empty state instead
// of an error screen.
export function okEnvelope<T>(
  payload: T,
): OpenSubsonicResponse<T>["subsonic-response"] {
  return {
    status: "ok" as const,
    version: openSubsonicApiVersion,
    type: "subsonic",
    serverVersion: useAuthBase.getState().serverVersion ?? "",
    openSubsonic: true,
    ...payload,
  };
}

export type SubsonicRequestOptions = { notFoundIsExpected?: boolean };

// Validate a Subsonic envelope, throwing the envelope error on a "failed"
// status. Used by subsonicRequest and the few non-GET endpoints.
export function subsonicEnvelope<T>(
  rsp: AxiosResponse<OpenSubsonicResponse<T>>,
  opts: SubsonicRequestOptions = {},
): OpenSubsonicResponse<T>["subsonic-response"] {
  const envelope = rsp.data?.["subsonic-response"];
  if (envelope?.status !== "ok") {
    // A wrong URL / reverse-proxy root can answer HTTP 200 with a non-Subsonic
    // body, so there's no envelope to read. Synthesize a stable error instead of
    // crashing on `.error` of undefined; code -1 is classified as expected
    // environmental noise, matching the SubsonicError(-1) some servers send.
    const error: OpenSubsonicErrorResponse = envelope?.error ?? {
      code: -1,
      message: "Invalid or empty response from server",
    };
    // Unlike a 501 this arrives as a successful HTTP response, so the error
    // interceptor never sees it — record the downgrade from here instead.
    if (isMethodNotSupported(error)) {
      noteUnsupportedEndpoint(rsp.config?.url);
    }
    // Application-level Subsonic failure (HTTP 200, status "failed"). Code 40 is
    // wrong-credentials, already handled by the response interceptor's logout —
    // don't double-report it. Everything else is a real failing endpoint (the
    // reportError classifier still drops expected codes such as 50 from Sentry).
    if (error.code !== 40) {
      reportError(error, {
        area: "api",
        backend: "subsonic",
        endpoint: rsp.config?.url,
        status: error.code,
        notFoundIsExpected: opts.notFoundIsExpected,
      });
    }
    throw error;
  }
  return envelope;
}

// Shared request wrapper for the section files: performs the GET and validates
// the Subsonic envelope.
export async function subsonicRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  config: Omit<AxiosRequestConfig, "params"> = {},
  opts: SubsonicRequestOptions = {},
): Promise<OpenSubsonicResponse<T>["subsonic-response"]> {
  return subsonicEnvelope(
    await openSubsonicApiInstance.get<OpenSubsonicResponse<T>>(path, {
      ...config,
      params,
    }),
    opts,
  );
}

// A music-folder-scoped browse: the selected folder may be empty or stale
// (deleted/reindexed on the server → code 70). Resolve that "data not found" to
// an empty payload so the UI shows an empty state instead of an error, and don't
// report it as a bug.
export async function folderScopedRequest<T>(
  path: string,
  params: Record<string, unknown>,
  emptyPayload: T,
): Promise<OpenSubsonicResponse<T>["subsonic-response"]> {
  try {
    return await subsonicRequest<T>(
      path,
      params,
      {},
      {
        notFoundIsExpected: true,
      },
    );
  } catch (error) {
    if (isSubsonicDataNotFound(error)) return okEnvelope(emptyPayload);
    throw error;
  }
}

export default openSubsonicApiInstance;
