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
  createBareClient: () => ({ get: mockPingGet }),
}));
jest.mock("@/services/jellyfin/auth", () => ({
  authenticateByName: (...args: unknown[]) => mockJellyfinAuth(...args),
}));
jest.mock("@/services/navidrome/auth", () => ({ nativeLogin: jest.fn() }));
jest.mock("@/services/openSubsonic", () => ({
  openSubsonicErrorCodes: { 70: "localized: the data was not found" },
}));
jest.mock("@/services/openSubsonic/auth", () => ({
  computeSubsonicToken: async () => "tok",
  encodePasswordParam: (p: string) => `enc:${p}`,
  generateSalt: () => "salt",
  isCredentialErrorCode: (code: unknown) =>
    typeof code === "number" && [40, 41, 42, 43, 44].includes(code),
}));

const mockJellyfinAuth = jest.fn();
const mockPingGet = jest.fn();

import axios from "axios";
import {
  authenticateRemote,
  authenticateWithFallback,
  LoginFailedError,
  loginFailureMessage,
  loginFailureStatus,
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
  mockPingGet.mockReset();
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
    // fallback too, and falling back would mask the real message. The 401 is
    // re-thrown as InvalidCredentialsError so the login screen shows a
    // correctable message and Sentry never sees a wrong password.
    mockJellyfinAuth.mockRejectedValue(rejected(401));
    await expect(run()).rejects.toMatchObject({
      name: "InvalidCredentialsError",
    });
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

  it("passes the custom headers to both routes", async () => {
    // The server isn't in the store yet at login time, so these can only reach
    // the request as an argument — without them a proxy-fronted server rejects
    // the sign-in and the user can never save it.
    const headers = { "CF-Access-Client-Id": "id" };
    mockJellyfinAuth
      .mockRejectedValueOnce(unreachable())
      .mockResolvedValueOnce(ok);
    await authenticateWithFallback(
      "jellyfin",
      PRIMARY,
      FALLBACK,
      "alice",
      "secret",
      headers,
    );
    expect(mockJellyfinAuth).toHaveBeenNthCalledWith(
      1,
      PRIMARY,
      "alice",
      "secret",
      headers,
    );
    expect(mockJellyfinAuth).toHaveBeenNthCalledWith(
      2,
      FALLBACK,
      "alice",
      "secret",
      headers,
    );
  });
});

describe("Subsonic auth mechanism", () => {
  const pingOk = { data: { "subsonic-response": { status: "ok" } } };
  const pingFailed = (code: number) => ({
    data: { "subsonic-response": { status: "failed", error: { code } } },
  });
  const paramsOf = (call: number) => mockPingGet.mock.calls[call][1].params;

  it("prefers token+salt", async () => {
    mockPingGet.mockResolvedValue(pingOk);
    const options = await authenticateRemote(
      "opensubsonic",
      PRIMARY,
      "alice",
      "secret",
    );
    expect(paramsOf(0)).toMatchObject({ t: "tok", s: "salt" });
    expect(paramsOf(0).p).toBeUndefined();
    expect(options.useTokenAuth).toBe(true);
    expect(options.subsonicToken).toBe("tok");
  });

  it("falls back to password auth when the server rejects the mechanism", async () => {
    mockPingGet.mockResolvedValueOnce(pingFailed(41)).mockResolvedValue(pingOk);
    const options = await authenticateRemote(
      "opensubsonic",
      PRIMARY,
      "alice",
      "secret",
    );
    expect(mockPingGet).toHaveBeenCalledTimes(2);
    expect(paramsOf(1)).toMatchObject({ p: "enc:secret" });
    expect(options.useTokenAuth).toBe(false);
  });

  it("skips token auth entirely when the user forces password auth", async () => {
    mockPingGet.mockResolvedValue(pingOk);
    const options = await authenticateRemote(
      "opensubsonic",
      PRIMARY,
      "alice",
      "secret",
      undefined,
      true,
    );
    // One ping, password only: no token is ever offered to a server the user
    // has told us can't handle one.
    expect(mockPingGet).toHaveBeenCalledTimes(1);
    expect(paramsOf(0)).toMatchObject({ p: "enc:secret" });
    expect(paramsOf(0).t).toBeUndefined();
    expect(paramsOf(0).s).toBeUndefined();
    // The session must store no token/salt either, or the request interceptor
    // would go back to sending them.
    expect(options.useTokenAuth).toBe(false);
    expect(options.subsonicToken).toBeNull();
    expect(options.subsonicSalt).toBeNull();
  });

  it("does not retry with a token when forced password auth is rejected", async () => {
    mockPingGet.mockResolvedValue(pingFailed(41));
    await expect(
      authenticateRemote(
        "opensubsonic",
        PRIMARY,
        "alice",
        "secret",
        undefined,
        true,
      ),
    ).rejects.toMatchObject({ name: "InvalidCredentialsError" });
    expect(mockPingGet).toHaveBeenCalledTimes(1);
  });

  it("carries the override to the fallback route", async () => {
    mockPingGet.mockRejectedValueOnce(unreachable()).mockResolvedValue(pingOk);
    const result = await authenticateWithFallback(
      "opensubsonic",
      PRIMARY,
      FALLBACK,
      "alice",
      "secret",
      undefined,
      true,
    );
    expect(result.activeUrl).toBe(FALLBACK);
    expect(paramsOf(1)).toMatchObject({ p: "enc:secret" });
  });
});

// A login the server refuses is reported to Sentry (unlike a wrong password),
// so what the thrown error carries decides whether the Issue is readable. It
// used to carry the *translated* message and nothing else: the Issue title was
// whichever language the last reporter's phone was set to, and the Subsonic
// error code never left the device.
describe("login failure reporting", () => {
  const pingFailed = (code?: number) => ({
    data: {
      "subsonic-response": {
        status: "failed",
        ...(code === undefined ? {} : { error: { code } }),
      },
    },
  });

  it("reports a rejected envelope in English, with the code, and shows the translation", async () => {
    mockPingGet.mockResolvedValue(pingFailed(70));
    const error = await authenticateRemote(
      "navidrome",
      PRIMARY,
      "alice",
      "secret",
    ).catch((e) => e);

    expect(error).toBeInstanceOf(LoginFailedError);
    // What Sentry titles the Issue: stable, English, and it names the code.
    expect(error.message).toBe("Subsonic login rejected: error code 70");
    expect(error.subsonicCode).toBe(70);
    // What the user reads stays localized — just no longer as `message`.
    expect(loginFailureMessage(error)).toBe(
      "localized: the data was not found",
    );
  });

  it("distinguishes a response that carries no Subsonic envelope", async () => {
    // A reverse-proxy root or a captive portal answering 200 with HTML: the
    // wrong base path, not a server-side rejection. Same toast, different bug.
    mockPingGet.mockResolvedValue({ data: "<html>login</html>" });
    const error = await authenticateRemote(
      "navidrome",
      PRIMARY,
      "alice",
      "secret",
    ).catch((e) => e);

    expect(error.message).toBe(
      "Subsonic login: response carries no subsonic-response envelope",
    );
    expect(error.subsonicCode).toBeUndefined();
    expect(loginFailureMessage(error)).toBe("auth.login.loginErrorMessage");
  });

  it("still raises InvalidCredentialsError for a credential code", async () => {
    // Which is what keeps every wrong password out of Sentry — isExpectedNoise
    // drops it by name.
    mockPingGet.mockResolvedValue(pingFailed(40));
    await expect(
      authenticateRemote("navidrome", PRIMARY, "alice", "secret"),
    ).rejects.toMatchObject({ name: "InvalidCredentialsError" });
  });

  it("keeps a non-Subsonic setup failure English too", async () => {
    const error = await authenticateRemote(
      "smb",
      "not-a-share-url",
      "alice",
      "secret",
    ).catch((e) => e);

    expect(error.message).toBe("SMB: unparseable share URL");
    expect(loginFailureMessage(error)).toBe("auth.login.smbUrlInvalid");
  });

  describe("loginFailureStatus", () => {
    it("uses the Subsonic code, since the rejection arrives over a 200", async () => {
      mockPingGet.mockResolvedValue(pingFailed(70));
      const error = await authenticateRemote(
        "navidrome",
        PRIMARY,
        "alice",
        "secret",
      ).catch((e) => e);
      expect(loginFailureStatus(error)).toBe(70);
    });

    it("uses the HTTP status when the server answered with one", () => {
      expect(loginFailureStatus(rejected(403))).toBe(403);
    });

    it("is undefined when nothing answered", () => {
      // An unreachable server is environmental noise; a status here would
      // suggest a rejection that never happened.
      expect(loginFailureStatus(unreachable())).toBeUndefined();
      expect(loginFailureStatus(new Error("boom"))).toBeUndefined();
    });
  });

  it("leaves every other error's message alone", () => {
    expect(loginFailureMessage(new Error("boom"))).toBe("boom");
    expect(loginFailureMessage("boom")).toBe("boom");
  });
});
