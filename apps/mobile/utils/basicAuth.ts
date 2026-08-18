/**
 * An HTTP Basic `Authorization` header value (RFC 7617).
 *
 * `btoa` handles latin1 only, so the credentials are UTF-8 encoded first — which
 * is what RFC 7617 specifies, and what a NAS with an accented password otherwise
 * silently rejects.
 *
 * Lives in utils/ rather than next to its callers so the login flow and
 * services/serverHeaders.ts share one encoding: login *proves* the credentials
 * and serverHeaders then replays them on every request, and two implementations
 * would eventually disagree on exactly that non-ASCII case. Dependency-free by
 * design — services/serverHeaders reaches the servers store, and pulling that
 * into the auth path drags MMKV along with it.
 */
export function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}
