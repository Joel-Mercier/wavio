/**
 * The claims of an ID token, unverified. It came straight from the token
 * endpoint over TLS in response to our own code exchange, which is exactly the
 * case where OIDC Core §3.1.3.7 lets a client skip the signature check — and
 * it's only read for a username hint the server then has to confirm.
 */
export function idTokenClaims(
  idToken: string | undefined,
): Record<string, unknown> | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}
