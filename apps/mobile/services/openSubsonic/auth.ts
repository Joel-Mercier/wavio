import * as Crypto from "expo-crypto";

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
