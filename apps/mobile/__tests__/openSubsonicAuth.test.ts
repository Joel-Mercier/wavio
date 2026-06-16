jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { MD5: "MD5" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  randomUUID: () => "11111111-2222-3333-4444-555555555555",
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
    require("node:crypto").createHash("md5").update(data).digest("hex"),
  ),
}));

import {
  computeSubsonicToken,
  generateSalt,
} from "@/services/openSubsonic/auth";

describe("openSubsonic auth", () => {
  it("computes the Subsonic token from the spec vector", async () => {
    // From the Subsonic API docs: md5("sesame" + "c19b2d").
    const token = await computeSubsonicToken("sesame", "c19b2d");
    expect(token).toBe("26719a1196d2a940705a59634eb18eab");
  });

  it("returns a lowercase hex token", async () => {
    const token = await computeSubsonicToken("p@ss", "saltsalt");
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("generates a salt of at least six characters with no dashes", () => {
    const salt = generateSalt();
    expect(salt.length).toBeGreaterThanOrEqual(6);
    expect(salt).not.toContain("-");
  });
});
