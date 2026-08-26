import { hostnameFromUrl, upstreamBaseForUrl } from "@/modules/ssl-trust";
import { speaksHttpType } from "@/services/backend/serverTraits";
import { type Server, useServersBase } from "@/stores/servers";
import { basicAuthHeader } from "@/utils/basicAuth";
import { USER_AGENT } from "@/utils/userAgent";

// User-defined headers for a server, resolved for an arbitrary request URL.
// Backend-agnostic (a reverse proxy fronts the whole origin regardless of which
// protocol we speak to it), hence services/ root rather than a backend dir —
// same reasoning as services/sslTrust.ts, which solves the mTLS variant of this
// problem and is the model for the `extra` threading on the login screen.

let cache: Map<string, Record<string, string>> | null = null;
let auth: Map<string, AuthEntry> | null = null;
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
    if (!speaksHttpType(server.type) || !server.headers) continue;
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

const DEFAULT_PORTS: Record<string, string> = { http: "80", https: "443" };

/**
 * `host:port` for a URL, with the scheme's default port filled in so
 * `https://nas.local` and `https://nas.local:443` resolve to the same key.
 *
 * Only the credential map keys on this; everything else here keys on the
 * hostname alone. A password must reach exactly the server it belongs to, and
 * one host routinely fronts several: a NAS running Navidrome on `:4533` and a
 * WebDAV share on `:443` is the ordinary setup, and host-keying would attach the
 * share's Basic header to every request to the other one.
 */
function originKeyFromUrl(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(url.trim());
  if (!match) return "";
  // Drop any `user:pass@` prefix so the authority is host[:port] alone.
  const authority = match[2].slice(match[2].lastIndexOf("@") + 1);
  const port = /:(\d+)$/.exec(authority);
  const host = (
    port ? authority.slice(0, port.index) : authority
  ).toLowerCase();
  if (!host) return "";
  return `${host}:${port?.[1] ?? DEFAULT_PORTS[match[1].toLowerCase()] ?? ""}`;
}

// The hostname is carried alongside so `outboundMap()` can still merge the
// user's host-keyed headers over the credentials.
type AuthEntry = { host: string; headers: Record<string, string> };

// Credentials the app itself must send, as opposed to headers the *user*
// configured. A WebDAV share authenticates with HTTP Basic on every request —
// listing, ranged tag read, playback, download, waveform — and those last three
// happen in native fetchers that never see the axios instances. Registering the
// header origin-keyed here is what makes them all work without threading
// credentials through six call sites.
//
// Kept out of `headerMap()` on purpose. That map answers "what did the user
// configure": it feeds `customHeaderHostMap()`, which mirrors headers into the
// Android widget's native store, and the settings UI. Neither should ever carry
// a password.
function buildAuthCache(): Map<string, AuthEntry> {
  const map = new Map<string, AuthEntry>();
  const { servers, users } = useServersBase.getState();

  const register = (server: Server, username: string, password: string) => {
    const value = basicAuthHeader(username, password);
    for (const url of [server.url, server.fallbackUrl]) {
      if (!url) continue;
      const origin = originKeyFromUrl(url);
      const host = hostnameFromUrl(url);
      if (origin && host)
        map.set(origin, { host, headers: { Authorization: value } });
    }
  };

  for (const server of servers) {
    if (server.type !== "webdav") continue;
    // A *saved* password, which only exists when the user opted in. Covers
    // servers other than the active one — a download that outlives a server
    // switch still resolves its credentials (same reason this map is
    // address-keyed rather than keyed by server id).
    const user = users.find((u) => u.serverId === server.id && u.password);
    if (user?.password) register(server, user.username, user.password);
  }

  // The active session last, so it wins. This is what makes a share work
  // without opting into saving the password: the signed-in session always has
  // one, so playback, downloads and the scan's tag reads all authenticate on a
  // plain sign-in.
  const active = session;
  if (active) {
    const server = servers.find((s) => s.id === active.serverId);
    if (server) register(server, active.username, active.password);
  }
  return map;
}

/** Credentials for the signed-in session, when it's a network file share. */
export type SessionCredentials = {
  serverId: string;
  username: string;
  password: string;
} | null;

let session: SessionCredentials = null;

/**
 * Publish the active session's share credentials.
 *
 * Pushed by stores/auth rather than pulled from it. Reaching into the auth store
 * from here would drag config/queryClient — and through it services/
 * errorReporting and the Sentry SDK — into every network path that only wanted a
 * header, plus the test graph of anything touching one. Same inversion, and the
 * same reason, as the `logoutHandlers` seam in stores/auth.ts.
 */
export function setSessionCredentials(next: SessionCredentials): void {
  const unchanged =
    session?.serverId === next?.serverId &&
    session?.username === next?.username &&
    session?.password === next?.password;
  if (unchanged) return;
  session = next;
  invalidate();
}

function authMap(): Map<string, AuthEntry> {
  if (!auth) auth = buildAuthCache();
  return auth;
}

function authHeadersForUrl(
  url: string | undefined,
): Record<string, string> | undefined {
  if (!url) return undefined;
  const map = authMap();
  if (map.size === 0) return undefined;
  const direct = map.get(originKeyFromUrl(url));
  if (direct) return direct.headers;
  const upstream = upstreamBaseForUrl(url);
  return upstream ? map.get(originKeyFromUrl(upstream))?.headers : undefined;
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

// Merge of the default agent with the server's configured headers. The user's
// values win, so someone overriding a User-Agent their WAF rejects still gets
// their way — same precedence as the axios instances.
//
// Two key spaces in one map, which is safe because an origin key always contains
// a `:` and a hostname never does: hostnames carry the user's headers, and the
// narrower origin keys carry those *plus* credentials. `lookupOutbound` tries the
// origin first, so a sibling server on another port of the same host gets the
// headers without the password.
function outboundMap(): Map<string, Record<string, string>> {
  if (!outbound) {
    outbound = new Map();
    for (const [host, headers] of headerMap()) {
      outbound.set(host, { "User-Agent": USER_AGENT, ...headers });
    }
    for (const [origin, { host, headers }] of authMap()) {
      // Credentials first so a user-configured Authorization still wins — the
      // reverse-proxy case (a service token fronting the share) is exactly when
      // someone would set one deliberately.
      outbound.set(origin, {
        "User-Agent": USER_AGENT,
        ...headers,
        ...headerMap().get(host),
      });
    }
  }
  return outbound;
}

function invalidate(): void {
  cache = null;
  auth = null;
  outbound = null;
  wrapped = new Map();
  names = null;
  for (const listener of listeners) listener();
}

useServersBase.subscribe(invalidate);

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
  const direct = lookupOutbound(map, url);
  if (direct) return direct;
  const upstream = upstreamBaseForUrl(url);
  const viaUpstream = upstream ? lookupOutbound(map, upstream) : undefined;
  return viaUpstream ?? DEFAULT_REQUEST_HEADERS;
}

function lookupOutbound(
  map: Map<string, Record<string, string>>,
  url: string,
): Record<string, string> | undefined {
  return map.get(originKeyFromUrl(url)) ?? map.get(hostnameFromUrl(url));
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
  // Includes the credentials a network file share needs, not only user-defined
  // headers — this is what expo-audio is handed for playback, so a WebDAV track
  // would 401 without it.
  const credentials = authHeadersForUrl(url);
  const custom = customHeadersForUrl(url);
  if (!credentials && !custom) return base;
  return { ...base, ...credentials, ...custom };
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
  // Not user-configured, but it carries a WebDAV share's password and reaches
  // the same breadcrumbs, so it belongs on the same scrub list.
  if (authMap().size > 0) next.add("authorization");
  names = next;
  return next;
}

/** Test seam: drop the memoized maps. */
export function __resetCustomHeadersCache(): void {
  cache = null;
  auth = null;
  session = null;
  outbound = null;
  wrapped = new Map();
  names = null;
}
