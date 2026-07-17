jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { MD5: "MD5" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  randomUUID: () => "11111111-2222-3333-4444-555555555555",
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
    require("node:crypto").createHash("md5").update(data).digest("hex"),
  ),
}));

const authState = {
  username: "joel",
  password: "sesame",
  subsonicSalt: "salt" as string | null,
  subsonicToken: "tok" as string | null,
  useTokenAuth: true,
};
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => authState },
}));

import {
  computeSubsonicToken,
  encodePasswordParam,
  generateSalt,
  subsonicAuthQuery,
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

  it("hex-encodes the password for the enc: param", () => {
    expect(encodePasswordParam("sesame")).toBe("enc:736573616d65");
  });

  it("encodes spaces and unicode as UTF-8 hex", () => {
    // "é" is two UTF-8 bytes (0xc3 0xa9); a space is 0x20.
    expect(encodePasswordParam("a é")).toBe("enc:6120c3a9");
  });
});

describe("subsonicAuthQuery", () => {
  beforeEach(() => {
    authState.username = "joel";
    authState.password = "sesame";
    authState.subsonicSalt = "salt";
    authState.subsonicToken = "tok";
    authState.useTokenAuth = true;
  });

  it("uses token+salt for token-auth sessions", () => {
    expect(subsonicAuthQuery()).toBe("u=joel&t=tok&s=salt");
  });

  it("falls back to enc: password auth when the server rejected token auth", () => {
    // Password-auth sessions store no token/salt (services/auth/authenticate.ts)
    // — the query must carry `p`, never a literal t=null&s=null.
    authState.useTokenAuth = false;
    authState.subsonicSalt = null;
    authState.subsonicToken = null;
    expect(subsonicAuthQuery()).toBe("u=joel&p=enc%3A736573616d65");
  });

  it("URL-encodes reserved characters in the username", () => {
    authState.username = "a b&c";
    expect(subsonicAuthQuery()).toBe("u=a%20b%26c&t=tok&s=salt");
  });
});
