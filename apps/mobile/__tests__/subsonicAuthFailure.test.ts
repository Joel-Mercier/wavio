// Subsonic error 40 means "wrong username or password", but servers hand it out
// for much more than that — Navidrome answers 40 for any failure looking the user
// up, and for a request that arrives without its auth params. Home fires ~18
// requests at once, so one bad answer used to end a session the login ping had
// just validated (issue #171). A 40 must now be corroborated before it signs
// anyone out, and must never do so on a verdict the server didn't give.
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

const authState = {
  isAuthenticated: true,
  url: "http://server",
  serverType: "navidrome" as string,
  serverId: "srv-1",
  username: "joel",
  serverVersion: null as string | null,
};
const mockLogout = jest.fn();
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      ...authState,
      logout: mockLogout,
      setServerVersion: jest.fn(),
    }),
  },
  currentAuthScope: () => "scope",
}));

const mockGet = jest.fn();
jest.mock("@/services/backend/probe", () => ({
  createBareClient: () => ({ get: mockGet }),
  PROBE_TIMEOUT_MS: 4000,
}));

const mockReportError = jest.fn();
const mockReportBreadcrumb = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
  reportBreadcrumb: (...args: unknown[]) => mockReportBreadcrumb(...args),
}));

let mockIsOnline = true;
jest.mock("@/services/network", () => ({
  USER_AGENT: "wavio",
  getIsOnline: () => mockIsOnline,
}));

jest.mock("@/services/openSubsonic/auth", () => ({
  isCredentialErrorCode: (code: unknown) =>
    typeof code === "number" && [40, 41, 42, 43, 44].includes(code),
  subsonicAuthParams: () => ({ u: "joel", t: "tok", s: "salt" }),
}));

jest.mock("@/services/navidromeIdMigration/detect", () => ({
  noteServerVersion: jest.fn(),
}));
jest.mock("@/services/serverHeaders", () => ({
  customHeadersForUrl: () => ({}),
}));

import type { AxiosResponse } from "axios";
import {
  __resetCredentialFailureState,
  noteSubsonicAuthFailure,
} from "@/services/auth/credentialFailure";
import openSubsonicApiInstance from "@/services/openSubsonic";

// The corroboration sleeps between its two attempts; drain both the timer and
// the promise chain it gates.
const settle = async () => {
  await jest.advanceTimersByTimeAsync(2000);
};

const pingOk = () => ({ data: { "subsonic-response": { status: "ok" } } });
const pingFailed = (code: number) => ({
  data: {
    "subsonic-response": { status: "failed", error: { code } },
  },
});

describe("noteSubsonicAuthFailure", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetCredentialFailureState();
    mockGet.mockReset();
    mockLogout.mockReset();
    mockReportError.mockReset();
    mockReportBreadcrumb.mockReset();
    mockIsOnline = true;
    authState.isAuthenticated = true;
    authState.url = "http://server";
    authState.serverType = "navidrome";
    authState.serverId = "srv-1";
    authState.username = "joel";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the session when the server still accepts the credentials", async () => {
    mockGet.mockResolvedValue(pingOk());
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(1);
    // The case that was invisible in Sentry before: a 40 on a session that is
    // demonstrably still valid.
    expect(mockReportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 40 }),
      expect.objectContaining({
        area: "auth",
        backend: "subsonic",
        endpoint: "/rest/getGenres",
        extra: expect.objectContaining({ verdict: "spurious" }),
      }),
    );
  });

  it("keeps the session when only the first attempt is rejected", async () => {
    // The load-correlated case: the first ping lands inside the same burst that
    // produced the 40, the second lands after it has drained.
    mockGet
      .mockResolvedValueOnce(pingFailed(40))
      .mockResolvedValueOnce(pingOk());
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("signs out when every attempt is rejected", async () => {
    mockGet.mockResolvedValue(pingFailed(40));
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    // A wrong password is the user's to fix, not a bug to report.
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("keeps the session when the ping itself fails", async () => {
    mockGet.mockRejectedValue(new Error("Network Error"));
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("keeps the session when the ping answers something that isn't a credential error", async () => {
    mockGet.mockResolvedValue(pingFailed(70));
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does not ping while the device is offline", async () => {
    mockIsOnline = false;
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("runs one corroboration round for a whole burst of failures", async () => {
    mockGet.mockResolvedValue(pingOk());
    for (let i = 0; i < 10; i++) noteSubsonicAuthFailure(`/rest/endpoint${i}`);
    await settle();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledTimes(1);
    // The burst count is the one field that separates "one flaky endpoint" from
    // "this server rejects everything" without server logs.
    expect(mockReportError.mock.calls[0][1].extra.burstCount).toBe(10);
  });

  it("reports a given endpoint once, however often it fails", async () => {
    // A broken endpoint is re-requested every time the user returns to a screen
    // that needs it, and each visit outlives the cooldown. Corroborating again
    // is right; filing another Issue every few seconds is not.
    mockGet.mockResolvedValue(pingOk());
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    jest.setSystemTime(Date.now() + 60000);
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it("still reports when the failure spreads to another endpoint", async () => {
    mockGet.mockResolvedValue(pingOk());
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    jest.setSystemTime(Date.now() + 60000);
    noteSubsonicAuthFailure("/rest/getAlbumList2");
    await settle();

    expect(mockReportError).toHaveBeenCalledTimes(2);
  });

  it("ignores further failures during the cooldown that follows a verdict", async () => {
    mockGet.mockResolvedValue(pingOk());
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    expect(mockGet).toHaveBeenCalledTimes(1);

    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("never signs out a session the verdict was not about", async () => {
    mockGet.mockResolvedValue(pingFailed(40));
    noteSubsonicAuthFailure("/rest/getGenres");
    // The user switches servers while the pings are in flight.
    authState.serverId = "srv-2";
    await settle();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does nothing for a signed-out session or an on-device library", async () => {
    authState.isAuthenticated = false;
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    expect(mockGet).not.toHaveBeenCalled();

    authState.isAuthenticated = true;
    authState.serverType = "local";
    noteSubsonicAuthFailure("/rest/getGenres");
    await settle();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("openSubsonic response interceptor", () => {
  const fulfilled = (response: unknown) => {
    const handler = (
      openSubsonicApiInstance.interceptors.response as unknown as {
        handlers: { fulfilled: (r: AxiosResponse) => AxiosResponse }[];
      }
    ).handlers[0];
    return handler.fulfilled(response as AxiosResponse);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    __resetCredentialFailureState();
    mockGet.mockReset();
    mockLogout.mockReset();
    mockIsOnline = true;
    authState.isAuthenticated = true;
    authState.serverId = "srv-1";
    authState.serverType = "navidrome";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("corroborates instead of signing out on the spot", async () => {
    mockGet.mockResolvedValue(pingOk());
    fulfilled({
      data: { "subsonic-response": { status: "failed", error: { code: 40 } } },
      config: { url: "/rest/getAlbumList2" },
    });

    // The whole point of the fix: no synchronous logout.
    expect(mockLogout).not.toHaveBeenCalled();
    await settle();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("leaves other envelope failures alone", async () => {
    fulfilled({
      data: { "subsonic-response": { status: "failed", error: { code: 70 } } },
      config: { url: "/rest/getAlbum" },
    });
    await settle();

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
