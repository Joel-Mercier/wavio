import {
  AuthError,
  AuthRequest,
  type AuthSessionResult,
  exchangeCodeAsync,
  TokenError,
  type TokenResponse,
} from "expo-auth-session";
import { Linking, Platform } from "react-native";
import type { AuthorizationServer } from "@/services/oidc/discovery";
import { oidcRedirectUri } from "@/services/oidc/redirect";
import { USER_AGENT } from "@/utils/userAgent";

// The client every admin registers for Wavio: public (no secret — none could be
// kept on a phone anyway), PKCE S256, redirect URI below. Fixed so a server URL
// is all a user ever types; overridable per server for IdPs that mint their own
// client ids.
export const DEFAULT_OIDC_CLIENT_ID = "wavio";

export type OidcTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
};

export function tokensFromResponse(response: TokenResponse): OidcTokens {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    idToken: response.idToken,
    expiresAt:
      typeof response.expiresIn === "number"
        ? (response.issuedAt + response.expiresIn) * 1000
        : undefined,
  };
}

export class OidcSignInError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OidcSignInError";
    this.code = code;
  }
}

/**
 * Android hands the redirect to the app through a `url` event while the Custom
 * Tab closes, and expo-web-browser races that against the app coming back to
 * the foreground: on a slow device the foreground wins and the result reads
 * "dismiss" with the code already delivered. Listening alongside it lets the
 * sign-in finish instead of making the user go through the IdP twice.
 */
function captureRedirect(redirectUri: string): {
  url: () => string | null;
  stop: () => void;
} {
  let captured: string | null = null;
  const subscription = Linking.addEventListener("url", ({ url }) => {
    if (url.startsWith(redirectUri)) captured = url;
  });
  return { url: () => captured, stop: () => subscription.remove() };
}

/**
 * Authorization Code + PKCE in the system browser (Custom Tabs /
 * ASWebAuthenticationSession — never a WebView, RFC 8252 §8.12).
 *
 * Resolves null when the user closes the browser: backing out of a sign-in
 * page is not an error worth a toast.
 */
export async function signInWithOidc({
  server,
  clientId,
  scopes,
  resource,
}: {
  server: AuthorizationServer;
  clientId: string;
  scopes: string[];
  resource?: string;
}): Promise<OidcTokens | null> {
  const redirectUri = oidcRedirectUri();
  const request = new AuthRequest({
    clientId,
    redirectUri,
    scopes,
    usePKCE: true,
    extraParams: resource ? { resource } : undefined,
  });

  const capture = captureRedirect(redirectUri);
  let result: AuthSessionResult;
  try {
    // Not ephemeral: the IdP's session cookie is what makes signing back in
    // after a revoked refresh token a single tap.
    result = await request.promptAsync(
      { authorizationEndpoint: server.authorizationEndpoint },
      { preferEphemeralSession: false },
    );
    if (
      Platform.OS === "android" &&
      result.type === "dismiss" &&
      !capture.url()
    ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const late = capture.url();
    if (result.type === "dismiss" && late) {
      result = request.parseReturnUrl(late);
    }
  } finally {
    capture.stop();
  }

  if (result.type === "error") {
    const error = result.error;
    throw new OidcSignInError(
      error?.code ?? "unknown",
      error?.description ?? error?.message ?? "Authorization failed",
    );
  }
  if (result.type !== "success") return null;

  const code = result.params.code;
  if (!code) {
    throw new OidcSignInError(
      "no_code",
      "Redirect carried no authorization code",
    );
  }

  try {
    const response = await exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier ?? "",
          ...(resource ? { resource } : {}),
        },
        extraHeaders: { "User-Agent": USER_AGENT },
      },
      { tokenEndpoint: server.tokenEndpoint },
    );
    return tokensFromResponse(response);
  } catch (error) {
    if (error instanceof AuthError || error instanceof TokenError) {
      throw new OidcSignInError(error.code, error.description ?? error.message);
    }
    throw error;
  }
}
