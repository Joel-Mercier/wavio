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
  createBareClient: (_url: string, _timeout: unknown, headers: unknown) => {
    mockClientHeaders.push(headers as Record<string, string>);
    return {
      get: (path: string, config: { params?: Record<string, string> }) =>
        mockRoute(path, config?.params ?? {}),
    };
  },
}));
jest.mock("@/services/jellyfin/auth", () => ({
  authenticateByName: jest.fn(),
}));
jest.mock("@/services/navidrome/auth", () => ({
  nativeLogin: (...args: unknown[]) => mockNativeLogin(...args),
}));
jest.mock("@/services/openSubsonic", () => ({ openSubsonicErrorCodes: {} }));
jest.mock("@/services/openSubsonic/auth", () => ({
  computeSubsonicToken: async () => "tok",
  encodePasswordParam: (p: string) => `enc:${p}`,
  generateSalt: () => "salt",
  isCredentialErrorCode: (code: unknown) =>
    typeof code === "number" && [40, 41, 42, 43, 44].includes(code),
}));

const mockClientHeaders: Record<string, string>[] = [];
const mockNativeLogin = jest.fn();
let mockRoute: (
  path: string,
  params: Record<string, string>,
) => Promise<{ status: number; data: unknown }>;

import axios from "axios";
import {
  authenticateRemote,
  LoginFailedError,
  parseNavidromeHeaderLogin,
} from "@/services/auth/authenticate";

const URL = "https://music.example.com";
const envelope = (body: Record<string, unknown>) => ({
  status: 200,
  data: { "subsonic-response": body },
});
const OK = envelope({ status: "ok" });

// The web UI's page as Navidrome serves it behind external auth: the config
// is JSON serialized into a JS string literal.
const indexHtml = (auth: unknown) =>
  `<html><script>window.__APP_CONFIG__ = ${JSON.stringify(
    JSON.stringify({ version: "0.64.2", auth }),
  )}</script></html>`;

const idToken = (claims: Record<string, unknown>) =>
  `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;

beforeEach(() => {
  mockClientHeaders.length = 0;
  mockNativeLogin.mockReset();
});

describe("parseNavidromeHeaderLogin", () => {
  it("reads the proxy user from the bootstrap config", () => {
    expect(
      parseNavidromeHeaderLogin(
        indexHtml({ id: "u1", username: "Joel", isAdmin: true }),
      ),
    ).toEqual({ id: "u1", username: "Joel", isAdmin: true });
  });

  it("is null when the page carries no signed-in user", () => {
    expect(parseNavidromeHeaderLogin(indexHtml(undefined))).toBeNull();
    expect(parseNavidromeHeaderLogin("<html></html>")).toBeNull();
  });
});

describe("authenticateRemote with single sign-on", () => {
  it("signs into Navidrome on the proxy's word alone", async () => {
    mockRoute = async (path) => {
      if (path === "/app/")
        return {
          status: 200,
          data: indexHtml({ id: "u1", username: "Joel", isAdmin: false }),
        };
      if (path === "/rest/ping") return OK;
      throw new Error(`unexpected ${path}`);
    };
    const options = await authenticateRemote(
      "navidrome",
      URL,
      "",
      "",
      { "CF-Access-Client-Id": "id" },
      false,
      { accessToken: "at" },
    );
    expect(options).toMatchObject({
      authMethod: "oidc",
      username: "Joel",
      useTokenAuth: false,
      subsonicToken: null,
      navidrome: { token: "", userId: "u1", isAdmin: false },
    });
    expect(mockClientHeaders[0]).toEqual({
      Authorization: "Bearer at",
      "CF-Access-Client-Id": "id",
    });
    expect(mockNativeLogin).not.toHaveBeenCalled();
  });

  it("asks tokenInfo, then confirms an ID-token hint with getUser", async () => {
    const asked: string[] = [];
    mockRoute = async (path, params) => {
      asked.push(path);
      if (path === "/rest/ping") return OK;
      if (path === "/rest/tokenInfo")
        return envelope({ status: "failed", error: { code: 0 } });
      if (path === "/rest/getUser" && params.username === "alice")
        return envelope({ status: "ok", user: { username: "Alice" } });
      return envelope({ status: "failed", error: { code: 50 } });
    };
    const options = await authenticateRemote(
      "opensubsonic",
      URL,
      "",
      "",
      undefined,
      false,
      { accessToken: "at", idToken: idToken({ preferred_username: "alice" }) },
    );
    expect(options.username).toBe("Alice");
    expect(asked).toEqual(["/rest/ping", "/rest/tokenInfo", "/rest/getUser"]);
  });

  it.each([
    [10, "auth.login.oidcExtAuthMissing"],
    [40, "auth.login.oidcNoServerAccount"],
  ])("explains Subsonic error %i in SSO terms", async (code, message) => {
    mockRoute = async (path) =>
      path === "/rest/ping"
        ? envelope({ status: "failed", error: { code } })
        : { status: 404, data: "" };
    const attempt = authenticateRemote(
      "opensubsonic",
      URL,
      "",
      "",
      undefined,
      false,
      { accessToken: "at" },
    );
    await expect(attempt).rejects.toBeInstanceOf(LoginFailedError);
    await expect(attempt).rejects.toMatchObject({ userMessage: message });
  });

  it("calls out a proxy that redirects to its sign-in page", async () => {
    mockRoute = async () => ({ status: 200, data: "<html>Log in</html>" });
    await expect(
      authenticateRemote("opensubsonic", URL, "", "", undefined, false, {
        accessToken: "at",
      }),
    ).rejects.toMatchObject({ userMessage: "auth.login.oidcProxyRedirected" });
  });

  it("calls out a proxy that refuses the token", async () => {
    mockRoute = async () => {
      const error = new axios.AxiosError("Unauthorized");
      // biome-ignore lint/suspicious/noExplicitAny: minimal axios response stub
      error.response = { status: 401 } as any;
      throw error;
    };
    await expect(
      authenticateRemote("opensubsonic", URL, "", "", undefined, false, {
        accessToken: "at",
      }),
    ).rejects.toMatchObject({ userMessage: "auth.login.oidcTokenRejected" });
  });

  it("fails clearly when no source names the user", async () => {
    mockRoute = async (path) =>
      path === "/rest/ping"
        ? OK
        : envelope({ status: "failed", error: { code: 0 } });
    await expect(
      authenticateRemote("opensubsonic", URL, "", "", undefined, false, {
        accessToken: "at",
      }),
    ).rejects.toMatchObject({ userMessage: "auth.login.oidcUsernameUnknown" });
  });

  it("keeps Subsonic credentials when SSO fronts a password server", async () => {
    let pingParams: Record<string, string> = {};
    mockRoute = async (path, params) => {
      pingParams = params;
      return path === "/rest/ping" ? OK : { status: 404, data: "" };
    };
    const options = await authenticateRemote(
      "opensubsonic",
      URL,
      "alice",
      "pw",
      undefined,
      false,
      { accessToken: "at" },
    );
    expect(options.authMethod).toBe("oidc");
    expect(options.useTokenAuth).toBe(true);
    expect(pingParams).toMatchObject({ u: "alice", t: "tok", s: "salt" });
    expect(mockClientHeaders[0]).toMatchObject({ Authorization: "Bearer at" });
  });
});
