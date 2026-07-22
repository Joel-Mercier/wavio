import {
  addBreadcrumb,
  type Breadcrumb,
  captureException,
  type ErrorEvent,
  withScope,
} from "@sentry/react-native";
import axios from "axios";

// Network state is read lazily: a static `import … from "@/services/network"`
// would pull the whole backend-dispatch + i18n module graph into every
// reportError consumer (the query client, utils/log, the axios layers), which
// is needless weight and breaks jest's transform of some ESM-only deps.
function getIsOnline(): boolean {
  return (
    require("@/services/network") as typeof import("@/services/network")
  ).getIsOnline();
}
function getServerReachable(): boolean {
  return (
    require("@/services/network") as typeof import("@/services/network")
  ).getServerReachable();
}

// Central error reporting for the service layer. Every chokepoint (axios
// interceptors, GraphQL wrappers, the player, the local indexer) routes through
// `reportError` so the decision of *what is worth a Sentry Issue* lives in one
// place — instead of each call site blindly forwarding everything (which buries
// real failures under offline noise) or swallowing everything (which hides them
// entirely). Lives at the services root, not under a backend, because it is
// backend-agnostic and reused by all of them.

export type ReportArea =
  | "api"
  | "auth"
  | "player"
  | "local-library"
  | "metadata"
  | "storage"
  | "ui";

export type ReportBackend = "subsonic" | "jellyfin" | "local";

export type ReportApi =
  | "taddy"
  | "radio-browser"
  | "lrclib"
  | "lidarr"
  | "github";

export type ReportContext = {
  /** Coarse subsystem the failure came from; becomes the `area` tag. */
  area: ReportArea;
  /** Which media backend, when the failure is backend-specific. */
  backend?: ReportBackend;
  /** Which external API, when the failure is an external-API call. */
  api?: ReportApi;
  /** Endpoint / path / query key — used for grouping and as context. */
  endpoint?: string;
  /** HTTP status or domain error code, when known. */
  status?: number | string;
  /**
   * When true, a "not found" — HTTP 404 or Subsonic code 70 — is expected (e.g.
   * an empty/stale music folder browse) and not a reportable bug.
   */
  notFoundIsExpected?: boolean;
  /** Extra structured context attached to the Sentry event. */
  extra?: Record<string, unknown>;
};

// A request failure that says nothing about a bug in the app or the API — it's
// the environment. We deliberately do NOT report these: they fire constantly
// during normal offline use and would drown the signal we actually want.
//
// - cancelled requests (a screen unmounted, a query was aborted)
// - an axios error with no response: connection refused / DNS / timeout. These
//   are connectivity-class (server unreachable, external API down at the socket
//   level) and are already surfaced to the user via the offline/unreachable UI
//   and the reachability probe in services/network.ts. Real *application*
//   failures come back with an HTTP status (4xx/5xx) or a domain error envelope,
//   and those are reported.
// - a gateway / upstream status: the edge (Cloudflare, nginx, a reverse proxy)
//   is up but couldn't reach or get a healthy answer from the origin — 502 Bad
//   Gateway, 503 Service Unavailable, 504 Gateway Timeout, Cloudflare's 520–527
//   origin-error range, and 530 (Argo/Tunnel down). For the self-hosted servers
//   behind a proxy this app talks to, these are the same class as a connection
//   error — the box is unreachable, not buggy — but they arrive *with* a response
//   so the `!error.response` check above misses them. Suppress them directly
//   instead of waiting for the reachability probe to flip, which would otherwise
//   let every concurrent request to a downed origin report its own gateway error.
//   A plain 500 is intentionally left reportable: that's the origin itself
//   erroring (which can be a real bug), not an unreachable gateway.
//
// Scoped to the error object itself (no device-online check) so `logError` can
// reuse it without dropping every log while offline.
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([
  502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530,
]);

export function isNetworkNoise(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (axios.isAxiosError(error) && !error.response) return true;
  if (
    axios.isAxiosError(error) &&
    error.response != null &&
    GATEWAY_STATUSES.has(error.response.status)
  ) {
    return true;
  }
  return false;
}

// A Navidrome plugin (e.g. AudioMuse-AI, which takes over getSimilarSongs2 /
// getSonicSimilarTracks to compute audio similarity on demand) whose own upstream
// call timed out: the server returns a generic Subsonic code-0 "Internal Server
// Error" carrying Go's "context deadline exceeded". That's a transient
// server-side timeout — the same environmental class as a socket timeout
// (isNetworkNoise), one layer up inside the server — not an app bug, so don't
// report it. Matched narrowly on the timeout idiom so other code-0 internal
// errors (and non-timeout plugin failures) still surface.
function isPluginTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: number; message?: string };
  return (
    code === 0 &&
    typeof message === "string" &&
    message.includes("context deadline exceeded")
  );
}

// A Subsonic envelope error that says nothing about an app bug:
// - code 0 with a "Method not supported: <method>" message — the server doesn't
//   implement (or has disabled) that endpoint. It's the Subsonic-envelope
//   equivalent of an HTTP 501 (already suppressed): a server-capability signal.
// - code -1 "Invalid or empty response from server" — a reverse proxy answered
//   with a non-JSON / empty body (an HTML error page) where the Subsonic JSON was
//   expected. Environmental, same class as an unreachable origin.
// Matched narrowly on the plain {code,message} shape the Subsonic layer throws.
function isUnsupportedOrEmptySubsonic(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: number; message?: string };
  if (
    code === 0 &&
    typeof message === "string" &&
    message.includes("Method not supported")
  ) {
    return true;
  }
  if (
    code === -1 &&
    typeof message === "string" &&
    message.includes("Invalid or empty response")
  ) {
    return true;
  }
  return false;
}

// Failures that are expected from the error itself, independent of any request
// context: network noise plus typed control-flow / user-input errors. Shared by
// `reportError`'s classifier and `logError` so neither path reports them —
// matched by name to avoid pulling the backend module graphs into this
// everywhere-imported module.
//
// - LocalUnsupportedError / JellyfinUnsupportedError: by-design "this backend
//   doesn't serve that" control flow. The dispatch layer and UI capability gates
//   are meant to keep these off the screen, but a stray query still rejects — it
//   surfaces as an empty/error state, not a bug.
// - InvalidFeedError: a user-entered feed URL that doesn't resolve to a
//   parseable RSS feed (e.g. an HTML page pasted into "add podcast"). Surfaced to
//   the user via an error toast — a correctable input mistake, not a bug.
// - "Missing queryFn": a React Query lifecycle artifact, not a call site bug — a
//   query that was paused while offline gets resumed after its only observer
//   unmounted (e.g. the user left the screen), so React Query has no queryFn to
//   run. There is no observer left to show anything, so it has no user impact.
// - DownloadCancelledError: an offline download aborted because the user logged
//   out / switched servers mid-flight (services/offline/downloadService.ts). A
//   self-inflicted cancellation the queue resumes on next login, not a bug.
export function isExpectedNoise(error: unknown): boolean {
  if (isNetworkNoise(error)) return true;
  if (isPluginTimeout(error)) return true;
  if (isUnsupportedOrEmptySubsonic(error)) return true;
  return (
    error instanceof Error &&
    (error.name === "LocalUnsupportedError" ||
      error.name === "JellyfinUnsupportedError" ||
      error.name === "InvalidFeedError" ||
      error.name === "DownloadCancelledError" ||
      error.message.startsWith("Missing queryFn"))
  );
}

function isExpectedFailure(error: unknown, ctx: ReportContext): boolean {
  if (isExpectedNoise(error)) return true;
  // Device has no connectivity at all — a network/API failure is expected. Only
  // applies to `api`; the local library, player engine and metadata extraction
  // work offline, so a failure there is a real bug even with no connectivity.
  if (ctx.area === "api" && !getIsOnline()) return true;
  // For a backend call, a probe-confirmed unreachable server is not a bug.
  if (
    ctx.backend &&
    ctx.backend !== "local" &&
    !getServerReachable() &&
    axios.isAxiosError(error)
  ) {
    return true;
  }
  // A "not found" the caller anticipates: HTTP 404, or Subsonic code 70 ("the
  // requested data was not found") — e.g. browsing a music folder the server
  // reports as empty or no longer maps to a library. A data state, not a bug.
  if (
    ctx.notFoundIsExpected &&
    ((axios.isAxiosError(error) && error.response?.status === 404) ||
      ctx.status === 70)
  ) {
    return true;
  }
  // 501 = the server doesn't implement (or has disabled) this endpoint. It's a
  // server-capability signal, not an app bug — the capability layer flips the
  // feature off on the first 501 so the UI stops calling it.
  if (axios.isAxiosError(error) && error.response?.status === 501) {
    return true;
  }
  // Subsonic error code 50 = "user is not authorized for the given operation"
  // (e.g. sharing is enabled server-wide but this account lacks the share
  // permission). A permission denial surfaced to the user via a toast, not a bug.
  if (ctx.status === 50) {
    return true;
  }
  return false;
}

function httpStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

// Turn whatever was thrown into a real Error so Sentry gets a type + stack and
// groups events sensibly. Subsonic/GraphQL layers throw plain `{ code, message }`
// objects; wrap them with a stable, code-bearing name so each error code becomes
// its own Issue rather than collapsing into one "Non-Error" bucket.
function toError(error: unknown, ctx: ReportContext): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === "object") {
    const obj = error as { code?: number | string; message?: string };
    const err = new Error(obj.message ?? JSON.stringify(error));
    const base =
      ctx.backend === "subsonic"
        ? "SubsonicError"
        : ctx.api === "taddy"
          ? "TaddyError"
          : "ServiceError";
    err.name = obj.code != null ? `${base}(${obj.code})` : base;
    return err;
  }
  return new Error(String(error));
}

/**
 * Report a service-layer failure to Sentry, unless it's expected environmental
 * noise (offline, unreachable server, cancelled request, expected 404). In
 * development it logs to the console instead, mirroring `logError`.
 */
const REPORTED = "__wavioReported";

export function reportError(error: unknown, ctx: ReportContext): void {
  // Dedupe across chokepoints, BEFORE classifying. The same error object often
  // passes through more than one reporter (e.g. a service interceptor with full
  // context, then the React Query cache safety net with only a query key). Mark
  // it on first sight — whether we go on to capture OR suppress it — so the
  // first, most-specific classification wins. Marking suppressed-as-expected
  // errors too is the point: otherwise the context-poor safety net re-reports a
  // failure the chokepoint already knew was expected (e.g. an opted-in 404/code
  // 70, or a code-50 permission denial), stripped of the `status` /
  // `notFoundIsExpected` that would have dropped it — re-capturing the noise.
  if (error && typeof error === "object") {
    if ((error as Record<string, unknown>)[REPORTED]) return;
    try {
      Object.defineProperty(error, REPORTED, {
        value: true,
        enumerable: false,
      });
    } catch {
      // Frozen/sealed error object — fall through and report (worst case a dup).
    }
  }
  if (isExpectedFailure(error, ctx)) return;
  if (__DEV__) {
    console.error(`[${ctx.area}]`, ctx.endpoint ?? "", error);
    return;
  }
  const normalized = toError(error, ctx);
  const status = ctx.status ?? httpStatus(error);
  withScope((scope) => {
    scope.setTag("area", ctx.area);
    if (ctx.backend) scope.setTag("backend", ctx.backend);
    if (ctx.api) scope.setTag("api", ctx.api);
    if (status != null) scope.setTag("status", String(status));
    scope.setContext("request", {
      endpoint: ctx.endpoint ?? null,
      status: status ?? null,
      ...ctx.extra,
    });
    // Group by subsystem + source + endpoint (or status/error name) so distinct
    // failing endpoints become distinct Issues.
    scope.setFingerprint(
      [
        ctx.area,
        ctx.backend ?? ctx.api ?? "",
        ctx.endpoint ?? String(status ?? normalized.name),
      ].filter(Boolean),
    );
    captureException(normalized, ctx.extra ? { extra: ctx.extra } : undefined);
  });
}

/**
 * Drop a breadcrumb so a later crash/Issue carries the lead-up context (e.g.
 * the playback action that preceded a player failure). No-op in development.
 */
export function reportBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (__DEV__) return;
  addBreadcrumb({ category, message, level: "info", data });
}

// --- PII scrubbing (wired into Sentry.init) --------------------------------
//
// `sendDefaultPii` is on, and Subsonic authenticates by putting the password
// (`p`) — or token/salt (`t`/`s`) — directly in the request query string. The
// default HTTP-breadcrumb integration and event request data would otherwise
// ship those credentials to Sentry. Strip them from any URL, plus the Jellyfin
// (`X-Emby-Token`/`X-Emby-Authorization`) and Taddy (`X-API-KEY`/`X-USER-ID`)
// auth headers, before anything leaves the device.
const SENSITIVE_PARAM_RE =
  /([?&](?:p|password|u|username|s|t|salt|token|api[-_]?key)=)[^&#]*/gi;

const SENSITIVE_HEADER_KEYS = new Set([
  "x-emby-token",
  "x-emby-authorization",
  "x-api-key",
  "x-user-id",
  "authorization",
  "cookie",
]);

export function scrubUrl<T extends string | undefined>(url: T): T {
  if (!url) return url;
  return url.replace(SENSITIVE_PARAM_RE, "$1[Filtered]") as T;
}

function scrubHeaders(headers?: Record<string, unknown>): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      headers[key] = "[Filtered]";
    }
  }
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data && typeof breadcrumb.data.url === "string") {
    breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
  }
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    request.url = scrubUrl(request.url);
    if (typeof request.query_string === "string") {
      request.query_string = scrubUrl(request.query_string);
    }
    scrubHeaders(request.headers as Record<string, unknown> | undefined);
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) scrubBreadcrumb(crumb);
  }
  return event;
}
