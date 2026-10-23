import {
  clearBackgroundTimer,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";
import { reportBreadcrumb } from "@/services/errorReporting";
import { useAuthBase } from "@/stores/auth";
import {
  getOidcSession,
  type OidcSession,
  oidcSessionKey,
  useOidcBase,
} from "@/stores/oidc";
import { USER_AGENT } from "@/utils/userAgent";

// Token lifecycle for single-sign-on sessions. The access token rides in an
// `Authorization` header on every request (services/serverHeaders.ts, fed from
// stores/auth.ts), and most consumers read that header synchronously — the
// player, image loader and downloader are native fetchers — so the token has to
// be fresh *before* they ask, not repaired after a 401.

// Refresh this long before expiry. Covers clock skew and the time a request
// spends in flight, so a token is never presented in its last seconds.
export const REFRESH_MARGIN_MS = 60_000;

// The authorization server's answers that mean "this refresh token will never
// work again". Anything else — a timeout, a 5xx, an IdP that's down — keeps the
// session: like the rest of the app, a network failure never signs anyone out.
const TERMINAL_ERRORS = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
]);

// expo-auth-session's fetch has no deadline, and callers include the
// reachability probe: an IdP that accepts the connection and never answers
// would otherwise wedge every probe behind this single-flight promise.
const REFRESH_TIMEOUT_MS = 15_000;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setBackgroundTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setBackgroundTimeout(
      () => reject(new Error("Token refresh timed out")),
      ms,
    );
  });
  return Promise.race([promise, deadline]).finally(() =>
    clearBackgroundTimer(timer),
  );
}

type AuthSessionModule = typeof import("expo-auth-session");

// Loaded on first refresh rather than at import: this module sits under every
// API client and probe, and expo-auth-session pulls the browser and linking
// modules in with it — nothing a jest suite for an API call should need.
function authSession(): AuthSessionModule {
  return require("expo-auth-session") as AuthSessionModule;
}

export function activeOidcKey(): string | null {
  const { isAuthenticated, authMethod, serverId, username } =
    useAuthBase.getState();
  if (!isAuthenticated || authMethod !== "oidc") return null;
  return oidcSessionKey(serverId, username);
}

export function isTokenFresh(session: OidcSession, now = Date.now()): boolean {
  return !session.expiresAt || session.expiresAt - now > REFRESH_MARGIN_MS;
}

export function isTerminalTokenError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && TERMINAL_ERRORS.has(code);
}

const inFlight = new Map<string, Promise<string | null>>();

function endSession(key: string): void {
  useOidcBase.getState().removeSession(key);
  if (activeOidcKey() !== key) return;
  reportBreadcrumb("auth", "oidc-session-expired", {});
  useOidcBase.getState().setExpiredNotice(key);
  useAuthBase.getState().logout();
}

/**
 * The access token for `key`, refreshed first when it's within
 * `REFRESH_MARGIN_MS` of expiring (or always, with `force` — after a 401).
 *
 * Single-flight per session: a burst of parallel 401s, or the scheduler firing
 * while a request is already refreshing, share one token request. That matters
 * beyond politeness — Authentik and Authelia can rotate refresh tokens, so two
 * concurrent refreshes would have the second present an already-spent token
 * and end the session.
 *
 * Never throws. Resolves the best token available: the refreshed one, the
 * current one when the refresh failed transiently, or null once the session is
 * gone.
 */
export function refreshOidcSession(
  key: string,
  { force = false }: { force?: boolean } = {},
): Promise<string | null> {
  const pending = inFlight.get(key);
  if (pending) return pending;

  const session = useOidcBase.getState().sessions[key];
  if (!session) return Promise.resolve(null);
  if (!force && isTokenFresh(session)) {
    return Promise.resolve(session.accessToken);
  }
  if (!session.refreshToken) return Promise.resolve(session.accessToken);

  const promise = (async () => {
    try {
      const response = await withDeadline(
        authSession().refreshAsync(
          {
            clientId: session.clientId,
            refreshToken: session.refreshToken as string,
            extraParams: session.resource ? { resource: session.resource } : {},
            extraHeaders: { "User-Agent": USER_AGENT },
          },
          { tokenEndpoint: session.tokenEndpoint },
        ),
        REFRESH_TIMEOUT_MS,
      );
      // Written before anyone sees the new access token: if the server rotated
      // the refresh token, the old one is already spent, and losing the new one
      // to a crash would be a forced re-login.
      useOidcBase.getState().updateSession(key, {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken ?? session.refreshToken,
        idToken: response.idToken ?? session.idToken,
        expiresAt:
          typeof response.expiresIn === "number"
            ? (response.issuedAt + response.expiresIn) * 1000
            : undefined,
      });
      return response.accessToken;
    } catch (error) {
      if (isTerminalTokenError(error)) {
        endSession(key);
        return null;
      }
      reportBreadcrumb("auth", "oidc-refresh-failed", {
        code: (error as { code?: string })?.code ?? null,
      });
      return useOidcBase.getState().sessions[key]?.accessToken ?? null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Make sure the active session's token is good for the next request. A no-op
 * (resolving immediately) for password sessions and for a token that isn't
 * close to expiring, so callers can await it unconditionally.
 */
export async function ensureFreshAccessToken({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<void> {
  const key = activeOidcKey();
  if (key) await refreshOidcSession(key, { force });
}

/**
 * React to a 401 from the active server. Resolves true when a different token
 * is now in place, i.e. the request is worth one replay.
 */
export async function recoverFromUnauthorized(): Promise<boolean> {
  const key = activeOidcKey();
  if (!key) return false;
  const before = useOidcBase.getState().sessions[key]?.accessToken;
  const after = await refreshOidcSession(key, { force: true });
  return !!after && after !== before;
}

/**
 * Sign out of the IdP for this app: revoke the refresh token (best effort —
 * not every server has a revocation endpoint, and an offline sign-out must
 * still sign out) and forget the session.
 */
export async function revokeOidcSession(
  serverId: string,
  username: string,
): Promise<void> {
  const key = oidcSessionKey(serverId, username);
  const session = getOidcSession(serverId, username);
  useOidcBase.getState().removeSession(key);
  if (!session?.revocationEndpoint) return;
  const token = session.refreshToken ?? session.accessToken;
  try {
    await authSession().revokeAsync(
      {
        clientId: session.clientId,
        token,
        tokenTypeHint: session.refreshToken
          ? authSession().TokenTypeHint.RefreshToken
          : authSession().TokenTypeHint.AccessToken,
        extraHeaders: { "User-Agent": USER_AGENT },
      },
      { revocationEndpoint: session.revocationEndpoint },
    );
  } catch {}
}

/** Revoke every SSO session saved for a server that's being forgotten. */
export async function revokeServerOidcSessions(
  serverId: string,
): Promise<void> {
  const prefix = oidcSessionKey(serverId, "");
  const usernames = Object.keys(useOidcBase.getState().sessions)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
  await Promise.all(
    usernames.map((username) => revokeOidcSession(serverId, username)),
  );
}

export function __resetOidcSessionState(): void {
  inFlight.clear();
}
