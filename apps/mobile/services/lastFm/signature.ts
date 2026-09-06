import * as Crypto from "expo-crypto";
import { LASTFM_API_SECRET } from "@/services/lastFm/config";

export type LastFmParams = Record<string, string | number | undefined>;

// Excluded from the signature but still sent on the wire. Signing them is the
// single most common cause of error 13 ("invalid method signature").
// https://www.last.fm/api/authspec
const UNSIGNED_PARAMS = new Set(["format", "callback", "api_sig"]);

/**
 * Drops undefined values and stringifies the rest, so callers can pass optional
 * fields through without guarding each one.
 */
export const compactParams = (params: LastFmParams): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = String(value);
  }
  return out;
};

/**
 * The string that gets hashed: every signed parameter sorted by name,
 * concatenated as `<name><value>` with no separators, then the shared secret.
 *
 * The sort is a plain code-unit comparison, *not* `localeCompare`: batched
 * scrobbles carry bracketed names (`artist[0]`, `artist[10]`, `artist[2]`) and
 * Last.fm expects them ordered by the ASCII table, so `[10]` precedes `[2]`.
 * A locale-aware or numeric sort reorders them and every batch of ten or more
 * comes back as error 13.
 *
 * Exported for the tests, which check it without paying for a native digest.
 */
export const signatureBaseString = (
  params: Record<string, string>,
  secret: string,
): string => {
  const signed = Object.keys(params)
    .filter((key) => !UNSIGNED_PARAMS.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let base = "";
  for (const key of signed) base += key + params[key];
  return base + secret;
};

/**
 * `api_sig` for a Last.fm request: lowercase hex md5 of the UTF-8 bytes of the
 * base string above. Required on auth.* and on every write method; read methods
 * take `api_key` alone and must not be signed.
 */
export const signParams = async (
  params: Record<string, string>,
  secret: string = LASTFM_API_SECRET,
): Promise<string> =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    signatureBaseString(params, secret),
    { encoding: Crypto.CryptoEncoding.HEX },
  );
