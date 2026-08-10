import { hostnameFromUrl, upstreamBaseForUrl } from "@/modules/ssl-trust";
import { useServersBase } from "@/stores/servers";
import { USER_AGENT } from "@/utils/userAgent";

// User-defined headers for a server, resolved for an arbitrary request URL.
// Backend-agnostic (a reverse proxy fronts the whole origin regardless of which
// protocol we speak to it), hence services/ root rather than a backend dir —
// same reasoning as services/sslTrust.ts, which solves the mTLS variant of this
// problem and is the model for the `extra` threading on the login screen.

let cache: Map<string, Record<string, string>> | null = null;
let outbound: Map<string, Record<string, string>> | null = null;
let wrapped: Map<string, { uri: string; headers: Record<string, string> }> =
  new Map();
let names: Set<string> | null = null;
const listeners = new Set<() => void>();

// Keyed by host, not by server id: a server's two routes are two hostnames and
// either may be the one we end up talking to, so both are registered (mirrors
// savedClientCertificates in services/sslTrust.ts). It also means a download
// that outlives a server switch still resolves the right headers.
function buildCache(): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const server of useServersBase.getState().servers) {
    if (server.type === "local" || !server.headers) continue;
    if (Object.keys(server.headers).length === 0) continue;
    for (const url of [server.url, server.fallbackUrl]) {
      if (!url) continue;
      const host = hostnameFromUrl(url);
      // Object identity is shared across both routes on purpose — see the note
      // on customHeadersForUrl.
      if (host) map.set(host, server.headers);
    }
  }
  return map;
}

function headerMap(): Map<string, Record<string, string>> {
  if (!cache) cache = buildCache();
  return cache;
}

// The headers every *native* fetcher should send. Native image loaders and
// downloaders don't go through an axios instance, so without this they inherit
// the platform default (`Dalvik/…` on Android, `okhttp/…` for the ExoPlayer data
// source) — the exact agent Cloudflare's managed bot rules score as automated
// traffic, which is why utils/userAgent.ts exists.
//
// Frozen module constant so the no-custom-headers case — the overwhelming
// majority — hands out one shared object forever rather than allocating per
// call. See withServerHeaders on why identity matters here.
const DEFAULT_REQUEST_HEADERS: Record<string, string> = Object.freeze({
  "User-Agent": USER_AGENT,
});

// Per-host merge of the default agent with the server's configured headers. The
// user's values win, so someone overriding a User-Agent their WAF rejects still
// gets their way — same precedence as the axios instances.
function outboundMap(): Map<string, Record<string, string>> {
  if (!outbound) {
    outbound = new Map();
    for (const [host, custom] of headerMap()) {
      outbound.set(host, { "User-Agent": USER_AGENT, ...custom });
    }
  }
  return outbound;
}

useServersBase.subscribe(() => {
  cache = null;
  outbound = null;
  wrapped = new Map();
  names = null;
  for (const listener of listeners) listener();
});

/**
 * Observe changes to the configured headers. Used by the pieces that have to
 * push them somewhere else (the Android widget's native store), which can't
 * pull on demand because they render outside the JS runtime.
 */
export function subscribeCustomHeaders(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Headers configured for whichever saved server `url` belongs to, or undefined
 * when it belongs to none (a third-party API, an already-local file://).
 *
 * The returned object is **shared and must not be mutated**: it keeps a stable
 * identity for as long as the servers store is unchanged, so passing it into an
 * image `source` doesn't allocate on every FlashList row and defeat the card
 * memoization.
 */
export function customHeadersForUrl(
  url: string | undefined,
): Record<string, string> | undefined {
  if (!url) return undefined;
  const map = headerMap();
  if (map.size === 0) return undefined;
  const direct = map.get(hostnameFromUrl(url));
  if (direct) return direct;
  // On iOS a stream/artwork URL may already have been rewritten to the loopback
  // proxy (`http://127.0.0.1:<port>/<token>/…`), whose host matches no server.
  // Resolve it back to its upstream first. The Swift proxy forwards the request
  // head verbatim, so headers set on the loopback URL do reach the server.
  const upstream = upstreamBaseForUrl(url);
  return upstream ? map.get(hostnameFromUrl(upstream)) : undefined;
}

/**
 * Headers for any request this app makes outside an axios instance: the app's
 * User-Agent, plus the server's configured headers when `url` belongs to one.
 *
 * Prefer this over `customHeadersForUrl` in every native fetcher (image loaders,
 * file downloads, colour extraction). `customHeadersForUrl` stays the accessor
 * for "what did the *user* configure", which is a different question — it feeds
 * the Sentry scrub list and the widget's native header map.
 *
 * The returned object is **shared and must not be mutated**, and keeps a stable
 * identity while the servers store is unchanged.
 */
export function requestHeadersForUrl(
  url: string | undefined,
): Record<string, string> {
  if (!url) return DEFAULT_REQUEST_HEADERS;
  const map = outboundMap();
  if (map.size === 0) return DEFAULT_REQUEST_HEADERS;
  const direct = map.get(hostnameFromUrl(url));
  if (direct) return direct;
  const upstream = upstreamBaseForUrl(url);
  const viaUpstream = upstream ? map.get(hostnameFromUrl(upstream)) : undefined;
  return viaUpstream ?? DEFAULT_REQUEST_HEADERS;
}

/**
 * Merge the configured headers over `base`. The user's values win: someone
 * reaching for this feature may specifically need to override the User-Agent a
 * WAF rejects. Returns `base` unchanged (same identity) when nothing applies.
 */
export function mergeCustomHeaders(
  url: string | undefined,
  base: Record<string, string>,
): Record<string, string> {
  const custom = customHeadersForUrl(url);
  return custom ? { ...base, ...custom } : base;
}

function isRemote(uri: string): boolean {
  return /^https?:/i.test(uri);
}

// Every remote image now gets a headers object (if only to carry the User-Agent),
// so the old "return the source untouched" shortcut no longer covers the common
// case — and allocating a fresh `{ uri, headers }` on each render would hand
// expo-image a new source every time a row re-renders. These wrappers are
// memoized per URI instead and dropped wholesale whenever the servers store
// changes. Bounded because a large library has a lot of distinct cover URLs.
const MAX_WRAPPED = 512;

function wrappedFor(uri: string): {
  uri: string;
  headers: Record<string, string>;
} {
  const hit = wrapped.get(uri);
  if (hit) return hit;
  const next = { uri, headers: requestHeadersForUrl(uri) };
  if (wrapped.size >= MAX_WRAPPED) wrapped.clear();
  wrapped.set(uri, next);
  return next;
}

/**
 * Attach outbound headers to an image `source`, so cover art carries the app's
 * User-Agent and — for a proxy-fronted server — its configured headers. Applied
 * inside the shared image primitives rather than at the ~60 `artworkUrl()` call
 * sites, which would each have to remember.
 *
 * Returns `source` untouched (same identity) for anything that isn't a remote
 * URI: a `file://` cover, a bundled `require()` number, a `data:` URI, and any
 * source that already carries its own headers.
 */
export function withServerHeaders<T>(source: T): T {
  if (typeof source === "string") {
    if (!isRemote(source)) return source;
    return wrappedFor(source) as T;
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source;
  }
  const candidate = source as { uri?: unknown; headers?: unknown };
  if (typeof candidate.uri !== "string" || candidate.headers) return source;
  if (!isRemote(candidate.uri)) return source;
  // Only a `{ uri }` and nothing else can reuse the shared wrapper; anything
  // carrying extra fields (width/height/cacheKey/…) has to keep them.
  if (Object.keys(candidate).length === 1)
    return wrappedFor(candidate.uri) as T;
  return { ...candidate, headers: requestHeadersForUrl(candidate.uri) } as T;
}

/**
 * The whole host -> headers map, for consumers that have to mirror it somewhere
 * this module can't reach on demand (the Android widget's native store).
 */
export function customHeaderHostMap(): Record<string, Record<string, string>> {
  return Object.fromEntries(headerMap());
}

/**
 * Every header name configured on any saved server, lowercased. The names are
 * user-defined, so error reporting can't scrub them from a fixed list — see
 * services/errorReporting.ts.
 */
export function configuredHeaderNames(): Set<string> {
  if (names) return names;
  const next = new Set<string>();
  for (const headers of headerMap().values()) {
    for (const name of Object.keys(headers)) next.add(name.toLowerCase());
  }
  names = next;
  return next;
}

/** Test seam: drop the memoized maps. */
export function __resetCustomHeadersCache(): void {
  cache = null;
  outbound = null;
  wrapped = new Map();
  names = null;
}
