import { createBareClient } from "@/services/backend/probe";

// Discovery for single sign-on in front of a Subsonic server (issue #252): the
// reverse proxy publishes RFC 9728 Protected Resource Metadata naming its
// authorization server, so the user only ever types the server URL.

const DISCOVERY_TIMEOUT_MS = 8000;

export type ProtectedResource = {
  resource: string;
  authorizationServers: string[];
  scopes: string[];
};

export type AuthorizationServer = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  endSessionEndpoint?: string;
  scopesSupported?: string[];
};

export class OidcDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcDiscoveryError";
  }
}

function splitUrl(url: string): { origin: string; path: string } | null {
  const match = /^(https?:\/\/[^/?#]+)([^?#]*)/i.exec(url.trim());
  if (!match) return null;
  return { origin: match[1], path: match[2].replace(/\/+$/, "") };
}

// Scheme and host are case-insensitive and a trailing slash is the same
// resource; nothing else is forgiven, because RFC 9728 §3.3 requires the
// metadata's `resource` to be *identical* to the URL it was fetched for — the
// check that stops a lookalike host from steering us to its own sign-in page.
export function normalizeResource(url: string): string {
  const parts = splitUrl(url);
  if (!parts) return url.trim();
  return `${parts.origin.toLowerCase()}${parts.path}`;
}

/** RFC 9728 §3.1: the well-known suffix goes between the host and the path. */
export function protectedResourceMetadataUrl(resource: string): string | null {
  const parts = splitUrl(resource);
  if (!parts) return null;
  return `${parts.origin}/.well-known/oauth-protected-resource${parts.path}`;
}

function parseProtectedResource(data: unknown): ProtectedResource | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.resource !== "string") return null;
  const servers = Array.isArray(record.authorization_servers)
    ? record.authorization_servers.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      )
    : [];
  if (servers.length === 0) return null;
  const scopes = Array.isArray(record.scopes_supported)
    ? record.scopes_supported.filter((s): s is string => typeof s === "string")
    : [];
  return { resource: record.resource, authorizationServers: servers, scopes };
}

async function fetchJson(
  url: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await createBareClient(url, DISCOVERY_TIMEOUT_MS, {
    ...headers,
    Accept: "application/json",
  }).get("", { validateStatus: () => true });
  if (response.status !== 200) return null;
  if (typeof response.data === "string") {
    try {
      return JSON.parse(response.data);
    } catch {
      return null;
    }
  }
  return response.data;
}

// A 401 may name its metadata instead of the well-known path holding it
// (RFC 9728 §5.1): `WWW-Authenticate: Bearer resource_metadata="https://…"`.
export function resourceMetadataFromChallenge(
  header: string | undefined,
): string | null {
  if (!header) return null;
  const match = /resource_metadata\s*=\s*"([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * The proxy's Protected Resource Metadata for `url`, or null when it publishes
 * none (a server not behind SSO — by far the common case, so this never
 * throws for it).
 *
 * `headers` are the user's custom headers: a Cloudflare Access service token in
 * front of the proxy would otherwise hide the metadata too.
 */
export async function discoverProtectedResource(
  url: string,
  headers?: Record<string, string>,
): Promise<ProtectedResource | null> {
  const expected = normalizeResource(url);
  const wellKnown = protectedResourceMetadataUrl(url);
  if (!wellKnown) return null;

  const direct = parseProtectedResource(
    await fetchJson(wellKnown, headers).catch(() => null),
  );
  if (direct && normalizeResource(direct.resource) === expected) return direct;

  // Fallback: ask the API itself and follow the challenge. The resource it
  // names then only has to cover the URL we actually called.
  const probeUrl = `${expected}/rest/ping`;
  const challenge = await createBareClient(
    probeUrl,
    DISCOVERY_TIMEOUT_MS,
    headers,
  )
    .get("", { validateStatus: () => true })
    .catch(() => null);
  if (challenge?.status !== 401) return null;
  const metadataUrl = resourceMetadataFromChallenge(
    challenge.headers?.["www-authenticate"] as string | undefined,
  );
  if (!metadataUrl) return null;
  const challenged = parseProtectedResource(
    await fetchJson(metadataUrl, headers).catch(() => null),
  );
  if (!challenged) return null;
  const resource = normalizeResource(challenged.resource);
  return resource === expected || probeUrl.startsWith(`${resource}/`)
    ? challenged
    : null;
}

function sameIssuer(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function parseAuthorizationServer(
  data: unknown,
  issuer: string,
): AuthorizationServer | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  // Mix-up defence (RFC 8414 §3.3): the document must describe the issuer we
  // asked about. Only a trailing slash is tolerated — Authentik's issuers end
  // in one and some proxies' metadata drops it.
  if (typeof record.issuer !== "string" || !sameIssuer(record.issuer, issuer))
    return null;
  if (
    typeof record.authorization_endpoint !== "string" ||
    typeof record.token_endpoint !== "string"
  )
    return null;
  const methods = record.code_challenge_methods_supported;
  if (Array.isArray(methods) && !methods.includes("S256")) {
    throw new OidcDiscoveryError(
      "Authorization server does not support PKCE S256",
    );
  }
  const optional = (key: string) =>
    typeof record[key] === "string" ? (record[key] as string) : undefined;
  return {
    issuer: record.issuer,
    authorizationEndpoint: record.authorization_endpoint,
    tokenEndpoint: record.token_endpoint,
    revocationEndpoint: optional("revocation_endpoint"),
    endSessionEndpoint: optional("end_session_endpoint"),
    scopesSupported: Array.isArray(record.scopes_supported)
      ? record.scopes_supported.filter(
          (s): s is string => typeof s === "string",
        )
      : undefined,
  };
}

/**
 * OpenID Connect discovery for `issuer`, falling back to RFC 8414 OAuth
 * authorization server metadata (path-inserted, like RFC 9728's).
 */
export async function discoverAuthorizationServer(
  issuer: string,
): Promise<AuthorizationServer> {
  const trimmed = issuer.trim().replace(/\/+$/, "");
  const parts = splitUrl(trimmed);
  if (!parts) throw new OidcDiscoveryError("Issuer is not an http(s) URL");

  const candidates = [
    `${trimmed}/.well-known/openid-configuration`,
    `${parts.origin}/.well-known/oauth-authorization-server${parts.path}`,
  ];
  for (const candidate of candidates) {
    const data = await fetchJson(candidate).catch(() => null);
    const parsed = parseAuthorizationServer(data, issuer.trim());
    if (parsed) return parsed;
  }
  throw new OidcDiscoveryError("No authorization server metadata at issuer");
}

const BASE_SCOPES = ["openid", "profile", "offline_access"];

/**
 * The scopes to request: OpenID basics plus a refresh token, plus whatever the
 * proxy says it needs. `offline_access` is dropped where the server doesn't
 * list it — Keycloak and Authentik need it for a refresh token that outlives
 * the browser session, but a server that doesn't know it may refuse the
 * request outright.
 */
export function requestScopes(
  resourceScopes: string[],
  supported: string[] | undefined,
): string[] {
  const scopes = new Set([...BASE_SCOPES, ...resourceScopes]);
  if (supported && !supported.includes("offline_access")) {
    scopes.delete("offline_access");
  }
  return [...scopes];
}
