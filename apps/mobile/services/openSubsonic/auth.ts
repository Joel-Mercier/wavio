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

// Auth query-string fragment for Subsonic URLs built outside the axios
// instance (stream/download/HLS/cover art). Mirrors the request interceptor:
// token+salt normally, password auth for servers that rejected token auth at
// login (useTokenAuth false — those sessions store no token/salt at all, so
// interpolating them would produce a literal `t=null&s=null`).
export function subsonicAuthQuery(): string {
  const { username, password, subsonicSalt, subsonicToken, useTokenAuth } =
    useAuthBase.getState();
  const u = `u=${encodeURIComponent(username)}`;
  if (useTokenAuth === false) {
    return `${u}&p=${encodeURIComponent(encodePasswordParam(password))}`;
  }
  return `${u}&t=${subsonicToken}&s=${subsonicSalt}`;
}
