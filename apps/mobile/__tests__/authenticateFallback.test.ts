jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock("@/modules/ssl-trust", () => ({
  getCertificateInfo: jest.fn(),
  isCertificateTrusted: jest.fn().mockResolvedValue(false),
  isSSLError: () => false,
  isSslTrustAvailable: () => false,
}));
jest.mock("@/services/backend/probe", () => ({
  createBareClient: () => ({ get: jest.fn() }),
}));
jest.mock("@/services/jellyfin/auth", () => ({
  authenticateByName: (...args: unknown[]) => mockJellyfinAuth(...args),
}));
jest.mock("@/services/navidrome/auth", () => ({ nativeLogin: jest.fn() }));
jest.mock("@/services/openSubsonic", () => ({ openSubsonicErrorCodes: {} }));
jest.mock("@/services/openSubsonic/auth", () => ({
  computeSubsonicToken: async () => "tok",
  encodePasswordParam: (p: string) => p,
  generateSalt: () => "salt",
}));

const mockJellyfinAuth = jest.fn();

import axios from "axios";
import {
  authenticateWithFallback,
  SslUntrustedError,
} from "@/services/auth/authenticate";

const PRIMARY = "http://192.168.1.10:8096";
const FALLBACK = "https://music.example.com";

// A failure where nothing answered (timeout / DNS / refused).
const unreachable = () => {
  const err = new axios.AxiosError("Network Error");
  err.response = undefined;
  return err;
};

// A failure where the server answered and rejected us.
const rejected = (status: number) => {
  const err = new axios.AxiosError("Unauthorized");
  // biome-ignore lint/suspicious/noExplicitAny: minimal axios response stub
  err.response = { status } as any;
  return err;
};

const ok = { AccessToken: "at", User: { Id: "u1", Policy: {} } };

const run = () =>
  authenticateWithFallback("jellyfin", PRIMARY, FALLBACK, "alice", "secret");

beforeEach(() => {
  mockJellyfinAuth.mockReset();
});

describe("authenticateWithFallback", () => {
  it("uses the primary when it answers, without touching the fallback", async () => {
    mockJellyfinAuth.mockResolvedValue(ok);
    const result = await run();
    expect(result.activeUrl).toBe(PRIMARY);
    expect(mockJellyfinAuth).toHaveBeenCalledTimes(1);
  });

  it("falls back when the primary is unreachable", async () => {
    mockJellyfinAuth
      .mockRejectedValueOnce(unreachable())
      .mockResolvedValueOnce(ok);
    const result = await run();
    expect(result.activeUrl).toBe(FALLBACK);
    expect(result.options.serverType).toBe("jellyfin");
  });

  it("does not fall back when the primary rejects the credentials", async () => {
    // The primary answered; the same credentials would be rejected by the
    // fallback too, and falling back would mask the real message.
    mockJellyfinAuth.mockRejectedValue(rejected(401));
    await expect(run()).rejects.toMatchObject({ response: { status: 401 } });
    expect(mockJellyfinAuth).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when the primary's certificate is untrusted", async () => {
    // SslUntrustedError means the primary WAS reached — the user has to resolve
    // the trust prompt; silently using the fallback would hide that.
    mockJellyfinAuth.mockRejectedValue(new SslUntrustedError(PRIMARY));
    await expect(run()).rejects.toBeInstanceOf(SslUntrustedError);
    expect(mockJellyfinAuth).toHaveBeenCalledTimes(1);
  });

  it("surfaces the fallback's trust prompt when the fallback is untrusted", async () => {
    mockJellyfinAuth
      .mockRejectedValueOnce(unreachable())
      .mockRejectedValueOnce(new SslUntrustedError(FALLBACK));
    // Carries the fallback's URL, so the dialog prompts for the right host.
    await expect(run()).rejects.toMatchObject({
      name: "SslUntrustedError",
      url: FALLBACK,
    });
  });

  it("reports the primary's error when both routes fail", async () => {
    const primaryError = unreachable();
    mockJellyfinAuth
      .mockRejectedValueOnce(primaryError)
      .mockRejectedValueOnce(new Error("fallback also down"));
    // The primary is the URL the user typed and expects to hear about.
    await expect(run()).rejects.toBe(primaryError);
  });

  it("skips the fallback entirely when none is configured", async () => {
    mockJellyfinAuth.mockRejectedValue(unreachable());
    await expect(
      authenticateWithFallback("jellyfin", PRIMARY, undefined, "a", "b"),
    ).rejects.toBeDefined();
    expect(mockJellyfinAuth).toHaveBeenCalledTimes(1);
  });

  it("treats a blank fallback as none", async () => {
    mockJellyfinAuth.mockRejectedValue(unreachable());
    await expect(
      authenticateWithFallback("jellyfin", PRIMARY, "   ", "a", "b"),
    ).rejects.toBeDefined();
    expect(mockJellyfinAuth).toHaveBeenCalledTimes(1);
  });
});
