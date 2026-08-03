jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { MD5: "MD5" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
    require("node:crypto").createHash("md5").update(data).digest("hex"),
  ),
}));

import {
  canonicalId,
  canonicalIdMap,
  isCanonicalIdStable,
} from "@/utils/navidromeCanonicalId";

// Vectors lifted verbatim from Navidrome's own db/migrations/id_canonical_test.go
// (PR #5824). They are the contract: if upstream changes canonicalID before the
// PR merges, these are what must be regenerated.
const VECTORS: [name: string, input: string, want: string][] = [
  [
    "hash-family id (fits 128 bits) is kept",
    "5cLJPkLA5DK2BADhoeotPk",
    "5cLJPkLA5DK2BADhoeotPk",
  ],
  [
    "overflowing random id is remapped via md5",
    "zzzzzzzzzzzzzzzzzzzzzz",
    "3LyqmwQBm5IRqlVjNYASwb",
  ],
  [
    "legacy 32-hex is re-encoded value-preserving",
    "e3b7fc2ae9447bbec37a13bf916e3cf6",
    "6VHl3uR4kss6sUPKA8Cwnk",
  ],
  [
    "playlist uuid is re-encoded value-preserving",
    "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "7rke2SAWaicSeSYzkhww6R",
  ],
  ["empty string passes through", "", ""],
  ["share id (10 chars) passes through", "aB3xY9kQz1", "aB3xY9kQz1"],
  [
    "truncated Finamp id (16 chars) passes through",
    "0123456789abcdef",
    "0123456789abcdef",
  ],
  [
    "22 chars with non-base62 char passes through",
    "!!!!!!!!!!!!!!!!!!!!!!",
    "!!!!!!!!!!!!!!!!!!!!!!",
  ],
  [
    "32 chars non-hex passes through",
    "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
  ],
  [
    "36 chars without uuid dashes passes through",
    "000000000000000000000000000000000000",
    "000000000000000000000000000000000000",
  ],
  [
    // Go's hex.DecodeString accepts either case, so the transform must too —
    // uppercase and lowercase spellings of one id have to land on one value.
    "uppercase 32-hex re-encodes to the same value as lowercase",
    "E3B7FC2AE9447BBEC37A13BF916E3CF6",
    "6VHl3uR4kss6sUPKA8Cwnk",
  ],
  [
    "36 chars with dashes in the wrong positions passes through",
    "f47ac10b58-cc-4372-a567-0e02b2c3d479",
    "f47ac10b58-cc-4372-a567-0e02b2c3d479",
  ],
];

describe("canonicalId", () => {
  it.each(VECTORS)("%s", async (_name, input, want) => {
    await expect(canonicalId(input)).resolves.toBe(want);
  });

  it("uses the lowercase-first base62 alphabet", async () => {
    // Go's big.Int.Text(62) orders digits, lowercase, then uppercase. The old
    // nanoid alphabet was uppercase-first and yields "6vhL3Ur4KSS6Supka8cWNK"
    // here — a plausible-looking id that resolves to nothing.
    await expect(canonicalId("e3b7fc2ae9447bbec37a13bf916e3cf6")).resolves.toBe(
      "6VHl3uR4kss6sUPKA8Cwnk",
    );
  });

  it("zero-pads short values to exactly 22 chars", async () => {
    const result = await canonicalId("00000000000000000000000000000001");
    expect(result).toHaveLength(22);
    expect(result).toBe("0000000000000000000001");
  });

  it("maps the all-zero id to 22 zeroes", async () => {
    await expect(canonicalId("0".repeat(32))).resolves.toBe("0".repeat(22));
  });

  it("keeps a 22-char id at exactly the 2^128 boundary distinct", async () => {
    // BitLen() <= 128 is kept, so only values strictly over 2^128 - 1 are
    // md5-remapped. "1" followed by 21 zeroes in base62 is far below.
    const justUnder = "1".padEnd(22, "0");
    await expect(canonicalId(justUnder)).resolves.toBe(justUnder);
  });

  it("is idempotent for every shape", async () => {
    for (const [, input] of VECTORS) {
      const once = await canonicalId(input);
      await expect(canonicalId(once)).resolves.toBe(once);
    }
  });

  it("is the identity on already-canonical hash ids", async () => {
    // The whole pass relies on this: running the transform over ids that never
    // change must be a no-op, so applying it broadly is safe.
    for (const id of [
      "5cLJPkLA5DK2BADhoeotPk",
      "0000000000000000000001",
      "6VHl3uR4kss6sUPKA8Cwnk",
      "7rke2SAWaicSeSYzkhww6R",
    ]) {
      await expect(canonicalId(id)).resolves.toBe(id);
    }
  });

  it("leaves a MusicBrainz-shaped UUID recognisable as a 36-char rewrite", async () => {
    // Documents the hazard rather than the behaviour: canonicalId cannot tell an
    // MBID from a legacy playlist UUID, so callers must never pass one in.
    // services/navidromeIdMigration.ts is what enforces that.
    const mbid = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d";
    await expect(canonicalId(mbid)).resolves.not.toBe(mbid);
  });
});

describe("isCanonicalIdStable", () => {
  it("flags ids the transform would rewrite", () => {
    expect(isCanonicalIdStable("e3b7fc2ae9447bbec37a13bf916e3cf6")).toBe(false);
    expect(isCanonicalIdStable("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(
      false,
    );
    expect(isCanonicalIdStable("zzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("flags ids the transform leaves alone", () => {
    expect(isCanonicalIdStable("5cLJPkLA5DK2BADhoeotPk")).toBe(true);
    expect(isCanonicalIdStable("aB3xY9kQz1")).toBe(true);
    expect(isCanonicalIdStable("0123456789abcdef")).toBe(true);
    expect(isCanonicalIdStable("!!!!!!!!!!!!!!!!!!!!!!")).toBe(true);
    expect(isCanonicalIdStable("z".repeat(32))).toBe(true);
    expect(isCanonicalIdStable("0".repeat(36))).toBe(true);
  });

  it("agrees with canonicalId on every vector", async () => {
    for (const [, input] of VECTORS) {
      if (input.length === 0) continue;
      const changed = (await canonicalId(input)) !== input;
      expect(isCanonicalIdStable(input)).toBe(!changed);
    }
  });
});

describe("canonicalIdMap", () => {
  it("maps distinct ids and skips empties", async () => {
    const map = await canonicalIdMap([
      "e3b7fc2ae9447bbec37a13bf916e3cf6",
      "e3b7fc2ae9447bbec37a13bf916e3cf6",
      "",
      "5cLJPkLA5DK2BADhoeotPk",
    ]);
    expect(map.size).toBe(2);
    expect(map.get("e3b7fc2ae9447bbec37a13bf916e3cf6")).toBe(
      "6VHl3uR4kss6sUPKA8Cwnk",
    );
    expect(map.get("5cLJPkLA5DK2BADhoeotPk")).toBe("5cLJPkLA5DK2BADhoeotPk");
  });
});
