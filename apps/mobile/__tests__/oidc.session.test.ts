jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    zustandStorage: {
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      getItem: (key: string) => mem.get(key) ?? null,
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
  };
});

jest.mock("@/services/errorReporting", () => ({ reportBreadcrumb: jest.fn() }));

const mockAuthState = {
  isAuthenticated: true,
  authMethod: "oidc" as "password" | "oidc",
  serverId: "srv",
  username: "joel",
};
const mockLogout = jest.fn();
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ ...mockAuthState, logout: mockLogout }),
  },
}));

const mockRefreshAsync = jest.fn();
const mockRevokeAsync = jest.fn();
jest.mock("expo-auth-session", () => ({
  refreshAsync: (...args: unknown[]) => mockRefreshAsync(...args),
  revokeAsync: (...args: unknown[]) => mockRevokeAsync(...args),
  TokenTypeHint: { RefreshToken: "refresh_token", AccessToken: "access_token" },
}));

import {
  __resetOidcSessionState,
  ensureFreshAccessToken,
  recoverFromUnauthorized,
  refreshOidcSession,
  revokeOidcSession,
} from "@/services/oidc/session";
import { type OidcSession, oidcSessionKey, useOidcBase } from "@/stores/oidc";

const KEY = oidcSessionKey("srv", "joel");

const session = (over: Partial<OidcSession> = {}): OidcSession => ({
  issuer: "https://auth.example.com",
  clientId: "wavio",
  tokenEndpoint: "https://auth.example.com/token",
  revocationEndpoint: "https://auth.example.com/revoke",
  scopes: ["openid", "offline_access"],
  accessToken: "at-old",
  refreshToken: "rt-old",
  expiresAt: Date.now() + 10_000,
  ...over,
});

const tokenResponse = (over: Record<string, unknown> = {}) => ({
  accessToken: "at-new",
  refreshToken: "rt-new",
  idToken: undefined,
  expiresIn: 300,
  issuedAt: Math.floor(Date.now() / 1000),
  ...over,
});

const codedError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  __resetOidcSessionState();
  mockRefreshAsync.mockReset();
  mockRevokeAsync.mockReset();
  mockLogout.mockReset();
  mockAuthState.authMethod = "oidc";
  useOidcBase.setState({ sessions: {}, expiredNotice: null });
});

describe("refreshOidcSession", () => {
  it("leaves a fresh token alone", async () => {
    useOidcBase
      .getState()
      .setSession(KEY, session({ expiresAt: Date.now() + 3_600_000 }));
    await expect(refreshOidcSession(KEY)).resolves.toBe("at-old");
    expect(mockRefreshAsync).not.toHaveBeenCalled();
  });

  it("refreshes near expiry and stores the rotated refresh token", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRefreshAsync.mockResolvedValue(tokenResponse());
    await expect(refreshOidcSession(KEY)).resolves.toBe("at-new");
    const stored = useOidcBase.getState().sessions[KEY];
    expect(stored.refreshToken).toBe("rt-new");
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 200_000);
    expect(mockRefreshAsync.mock.calls[0][0]).toMatchObject({
      clientId: "wavio",
      refreshToken: "rt-old",
    });
  });

  it("keeps the refresh token when the server doesn't rotate it", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRefreshAsync.mockResolvedValue(
      tokenResponse({ refreshToken: undefined }),
    );
    await refreshOidcSession(KEY);
    expect(useOidcBase.getState().sessions[KEY].refreshToken).toBe("rt-old");
  });

  // Rotating servers spend the refresh token on first use: a second
  // concurrent request with the same token would end the session.
  it("shares one request between concurrent callers", async () => {
    useOidcBase.getState().setSession(KEY, session());
    let resolve: (value: unknown) => void = () => {};
    mockRefreshAsync.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const a = refreshOidcSession(KEY);
    const b = refreshOidcSession(KEY, { force: true });
    resolve(tokenResponse());
    await expect(Promise.all([a, b])).resolves.toEqual(["at-new", "at-new"]);
    expect(mockRefreshAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps the session through a network failure", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRefreshAsync.mockRejectedValue(new TypeError("Network request failed"));
    await expect(refreshOidcSession(KEY)).resolves.toBe("at-old");
    expect(useOidcBase.getState().sessions[KEY]).toBeDefined();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("ends the active session when the IdP refuses the refresh token", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRefreshAsync.mockRejectedValue(codedError("invalid_grant"));
    await expect(refreshOidcSession(KEY)).resolves.toBeNull();
    expect(useOidcBase.getState().sessions[KEY]).toBeUndefined();
    expect(useOidcBase.getState().expiredNotice).toBe(KEY);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("drops a saved session for another server without signing out", async () => {
    const other = oidcSessionKey("other", "joel");
    useOidcBase.getState().setSession(other, session());
    mockRefreshAsync.mockRejectedValue(codedError("invalid_grant"));
    await refreshOidcSession(other);
    expect(useOidcBase.getState().sessions[other]).toBeUndefined();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe("active-session helpers", () => {
  it("does nothing for a password session", async () => {
    mockAuthState.authMethod = "password";
    useOidcBase.getState().setSession(KEY, session());
    await ensureFreshAccessToken();
    await expect(recoverFromUnauthorized()).resolves.toBe(false);
    expect(mockRefreshAsync).not.toHaveBeenCalled();
  });

  it("forces a refresh after a 401 even for an unexpired token", async () => {
    useOidcBase
      .getState()
      .setSession(KEY, session({ expiresAt: Date.now() + 3_600_000 }));
    mockRefreshAsync.mockResolvedValue(tokenResponse());
    await expect(recoverFromUnauthorized()).resolves.toBe(true);
  });

  it("reports no recovery when the refresh couldn't produce a new token", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRefreshAsync.mockRejectedValue(new TypeError("Network request failed"));
    await expect(recoverFromUnauthorized()).resolves.toBe(false);
  });
});

describe("revokeOidcSession", () => {
  it("forgets the session even when revocation fails", async () => {
    useOidcBase.getState().setSession(KEY, session());
    mockRevokeAsync.mockRejectedValue(new Error("offline"));
    await revokeOidcSession("srv", "joel");
    expect(useOidcBase.getState().sessions[KEY]).toBeUndefined();
    expect(mockRevokeAsync.mock.calls[0][0]).toMatchObject({
      token: "rt-old",
      tokenTypeHint: "refresh_token",
    });
  });
});
