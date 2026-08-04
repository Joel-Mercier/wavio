import * as Crypto from "expo-crypto";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

// Port of Navidrome's `canonicalID` (db/migrations/20260720015443_uniform_canonical_ids.go)
// and `id.Encode` (model/id/id.go), which re-encode every historical Navidrome id
// shape into one canonical 22-char base62 form.
//
// Reproducing the transform client-side is what lets an upgrade be repaired
// locally: every persisted id maps to its new value with no server round trip
// and no fuzzy matching. See services/navidromeIdMigration.ts for the pass that
// applies it, and note that MusicBrainz ids must never be passed through here —
// the server explicitly leaves `mbz_*` columns alone, and a 36-char MBID looks
// exactly like a legacy playlist UUID to `canonicalId`.

// Go's big.Int Text(62)/SetString(_, 62) alphabet: digits, then LOWERCASE, then
// UPPERCASE. Navidrome's *old* nanoid alphabet was uppercase-first, so swapping
// these two produces ids that look entirely plausible and are entirely wrong.
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CANONICAL_LENGTH = 22;
const MAX_VALUE = 1n << 128n;

const HEX = /^[0-9a-fA-F]+$/;
const DIGEST_CONCURRENCY = 32;

/** base62 of a 128-bit value, zero-padded to 22 chars (Go's `%022s`). '0' is
 * base62's zero digit, so the padding is value-preserving. */
function encode(value: bigint): string {
  let out = "";
  let rest = value;
  while (rest > 0n) {
    out = BASE62[Number(rest % 62n)] + out;
    rest /= 62n;
  }
  return out.padStart(CANONICAL_LENGTH, "0");
}

function parseBase62(input: string): bigint | null {
  let value = 0n;
  for (const char of input) {
    const digit = BASE62.indexOf(char);
    if (digit < 0) return null;
    value = value * 62n + BigInt(digit);
  }
  return value;
}

const UUID_DASHES = [8, 13, 18, 23];

function uuidToHex(input: string): string | null {
  if (UUID_DASHES.some((index) => input[index] !== "-")) return null;
  const hex =
    input.slice(0, 8) +
    input.slice(9, 13) +
    input.slice(14, 18) +
    input.slice(19, 23) +
    input.slice(24);
  return HEX.test(hex) ? hex : null;
}

/**
 * Maps any historical Navidrome id shape to its canonical form. Unrecognised
 * shapes — share ids, truncated Jellyfin ids, malformed hex, anything that isn't
 * 22/32/36 chars — pass through unchanged, which is what makes this safe to run
 * over ids that were already canonical (it is the identity on those).
 */
export async function canonicalId(input: string): Promise<string> {
  switch (input.length) {
    case CANONICAL_LENGTH: {
      const value = parseBase62(input);
      // Already representable in 128 bits: keep it byte-for-byte. Only the
      // random nanoids drawn from the full 62^22 space overflow, and those are
      // remapped through the md5 of their own string.
      if (value === null || value < MAX_VALUE) return input;
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        input,
        { encoding: Crypto.CryptoEncoding.HEX },
      );
      return encode(BigInt(`0x${digest}`));
    }
    case 32:
      // Legacy MD5 hex id — value-preserving re-encode of the same 128 bits.
      if (!HEX.test(input)) return input;
      return encode(BigInt(`0x${input}`));
    case 36: {
      // Old playlist UUID — same value, dashes stripped.
      const hex = uuidToHex(input);
      if (hex === null) return input;
      return encode(BigInt(`0x${hex}`));
    }
    default:
      return input;
  }
}

/** True when `canonicalId` would leave the input untouched. Used to skip probe
 * samples that can't tell us whether the server migrated: an id that never
 * changes resolves either way. */
export function isCanonicalIdStable(input: string): boolean {
  if (input.length === 32) return !HEX.test(input);
  if (input.length === 36) return uuidToHex(input) === null;
  if (input.length !== CANONICAL_LENGTH) return true;
  const value = parseBase62(input);
  return value === null || value < MAX_VALUE;
}

/** Batch helper that computes each distinct id once. Legacy nanoids each cost a
 * native md5 call, and a large library holds tens of thousands of ids — enough
 * that firing them all in one tick would flood the JSI bridge. */
export async function canonicalIdMap(
  ids: Iterable<string>,
): Promise<Map<string, string>> {
  const distinct = [...new Set(ids)].filter((id) => id.length > 0);
  const mapped = await mapWithConcurrency(distinct, DIGEST_CONCURRENCY, (id) =>
    canonicalId(id),
  );
  return new Map(distinct.map((id, index) => [id, mapped[index]]));
}
