import {
  type AuthorizationServer,
  discoverAuthorizationServer,
  discoverProtectedResource,
  requestScopes,
} from "@/services/oidc/discovery";
import {
  DEFAULT_OIDC_CLIENT_ID,
  OidcSignInError,
  type OidcTokens,
  signInWithOidc,
} from "@/services/oidc/signIn";
import { oidcSessionKey, useOidcBase } from "@/stores/oidc";

// Everything a sign-in needs to know about where to sign in. Resolved once per
// attempt and stored with the tokens, so refreshing never repeats discovery.
export type SsoTarget = {
  server: AuthorizationServer;
  clientId: string;
  resource?: string;
  scopes: string[];
};

/**
 * Where this server's single sign-on lives: the issuer the user typed, or the
 * one its proxy publishes (RFC 9728) on the primary address, then the fallback.
 * Null when there's nothing to sign into.
 */
export async function resolveSsoTarget({
  urls,
  headers,
  issuer,
  clientId,
}: {
  urls: string[];
  headers?: Record<string, string>;
  issuer?: string;
  clientId?: string;
}): Promise<SsoTarget | null> {
  const id = clientId?.trim() || DEFAULT_OIDC_CLIENT_ID;
  if (issuer?.trim()) {
    const server = await discoverAuthorizationServer(issuer);
    return {
      server,
      clientId: id,
      scopes: requestScopes([], server.scopesSupported),
    };
  }
  for (const url of urls) {
    const resource = await discoverProtectedResource(url, headers);
    if (!resource) continue;
    const server = await discoverAuthorizationServer(
      resource.authorizationServers[0],
    );
    return {
      server,
      clientId: id,
      resource: resource.resource,
      scopes: requestScopes(resource.scopes, server.scopesSupported),
    };
  }
  return null;
}

/**
 * Run the browser sign-in for `target`. Null when the user backed out.
 *
 * The RFC 8707 `resource` parameter is what lets an audience-restricted
 * server (Authelia) mint a token for this proxy, but an authorization server
 * that doesn't recognise the value may refuse with `invalid_target` — in which
 * case the sign-in is tried once more without it, and the target remembers.
 */
export async function signInToTarget(
  target: SsoTarget,
): Promise<OidcTokens | null> {
  try {
    return await signInWithOidc(target);
  } catch (error) {
    if (
      error instanceof OidcSignInError &&
      error.code === "invalid_target" &&
      target.resource
    ) {
      target.resource = undefined;
      return signInWithOidc(target);
    }
    throw error;
  }
}

export function saveOidcSession(
  serverId: string,
  username: string,
  target: SsoTarget,
  tokens: OidcTokens,
): void {
  useOidcBase.getState().setSession(oidcSessionKey(serverId, username), {
    issuer: target.server.issuer,
    clientId: target.clientId,
    tokenEndpoint: target.server.tokenEndpoint,
    revocationEndpoint: target.server.revocationEndpoint,
    endSessionEndpoint: target.server.endSessionEndpoint,
    resource: target.resource,
    scopes: target.scopes,
    ...tokens,
  });
}
