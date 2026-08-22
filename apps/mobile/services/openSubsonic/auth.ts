import * as Crypto from "expo-crypto";
import { useAuthBase } from "@/stores/auth";

// Subsonic token authentication (API >= 1.13.0): instead of sending the
// password in cleartext (`p`) on every request, the client sends a random salt
// (`s`) and a token (`t` = md5(password + salt)). The salt is generated once per
// session and reused; the token is therefore stable, so it can be computed at
// login and stored alongside the salt.

export function generateSalt(): string {
  return Crypto.randomUUID().replace(/-/g, "");
}

export async function computeSubsonicToken(
  password: string,
  salt: string,
): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    password + salt,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return digest.toLowerCase();
}

// Subsonic legacy password auth (`p`): some servers (e.g. LMS/Lyrion's Subsonic
// bridge) don't support token auth and require the password instead. Sent as
// `enc:<hex>` — the UTF-8 bytes of the password hex-encoded — so special
// characters and unicode survive the query string intact.
export function encodePasswordParam(password: string): string {
  const bytes = new TextEncoder().encode(password);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `enc:${hex}`;
}

// Subsonic codes that mean "these credentials won't do": 40 wrong username or
// password, 41 token auth not supported, 42 mechanism not supported, 43 multiple
// conflicting auth mechanisms, 44 invalid API key.
//
// Lives here rather than next to its first caller because both the login flow
// (services/auth/authenticate.ts) and the corroborated sign-out
// (services/auth/credentialFailure.ts) need it, and this module is a leaf — it
// imports nothing from services/, so neither of them picks up a cycle.
const CREDENTIAL_ERROR_CODES = new Set([40, 41, 42, 43, 44]);

export function isCredentialErrorCode(code: unknown): boolean {
  return typeof code === "number" && CREDENTIAL_ERROR_CODES.has(code);
}

// The active session's Subsonic auth parameters — the single definition of how
// this app authenticates a Subsonic request. Token+salt normally, password auth
// (`p`) for servers that rejected token auth at login (useTokenAuth false, e.g.
// LMS/Lyrion). Exactly one mechanism is ever sent: supplying both `p` and `t`/`s`
// triggers error 43.
//
// The `!subsonicToken || !subsonicSalt` fallback is not defensive noise. axios
// drops null/undefined params, so a session that wants token auth but holds no
// token would send `u` alone — and a server answers that with error 40, the same
// code as a wrong password, which used to end the session on every request with
// no way out. Falling back to the password we still hold keeps such a session
// usable; if there's no password either, the server rejects it once and the
// corroborated sign-out (services/auth/credentialFailure.ts) ends it cleanly.
export function subsonicAuthParams(): Record<string, string> {
  const { username, password, subsonicSalt, subsonicToken, useTokenAuth } =
    useAuthBase.getState();
  if (useTokenAuth !== false && subsonicToken && subsonicSalt) {
    return { u: username, t: subsonicToken, s: subsonicSalt };
  }
  return { u: username, p: encodePasswordParam(password) };
}

// Auth query-string fragment for Subsonic URLs built outside the axios instance
// (stream/download/HLS/cover art). Same rules as subsonicAuthParams, rendered
// into a query string.
export function subsonicAuthQuery(): string {
  return Object.entries(subsonicAuthParams())
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}
