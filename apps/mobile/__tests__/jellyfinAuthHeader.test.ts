// Jellyfin 12 disables `EnableLegacyAuthorization` by default (PR #16992) and
// ships a migration that force-disables it on upgraded servers too, so the
// `X-Emby-Authorization` / `X-Emby-Token` pair we used to send authenticates
// nothing. The plain `Authorization` header with the `MediaBrowser` scheme is
// read ungated from 10.8 through 12, so it is the only spelling we send.
// Regressing this doesn't degrade a feature — it locks every user out, and
// login can't recover it (AuthenticateByName reads the client/device identity
// out of this same header).

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

jest.mock("@/services/network", () => ({ USER_AGENT: "Wavio/test" }));

jest.mock("@/services/jellyfin/deviceId", () => ({
  getDeviceId: () => "device",
}));

const mockCustomHeaders = {
  value: undefined as Record<string, string> | undefined,
};
jest.mock("@/services/serverHeaders", () => ({
  customHeadersForUrl: () => mockCustomHeaders.value,
}));

const mockAuthState = { jellyfinAccessToken: "token" as string | null };
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      url: "http://server/",
      jellyfinAccessToken: mockAuthState.jellyfinAccessToken,
      setJellyfinSession: jest.fn(),
      logout: jest.fn(),
    }),
  },
}));

import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import jellyfinApiInstance, {
  buildAuthorizationHeader,
} from "@/services/jellyfin/index";

// Run the registered request interceptor rather than a real request, so the
// assertions cover exactly what every Jellyfin call is given.
const applyInterceptor = () => {
  const handler = (
    jellyfinApiInstance.interceptors.request as unknown as {
      handlers: {
        fulfilled: (
          c: InternalAxiosRequestConfig,
        ) => InternalAxiosRequestConfig;
      }[];
    }
  ).handlers[0];
  return handler.fulfilled({
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig);
};

beforeEach(() => {
  mockAuthState.jellyfinAccessToken = "token";
  mockCustomHeaders.value = undefined;
});

describe("buildAuthorizationHeader", () => {
  it("uses the MediaBrowser scheme and embeds the token", () => {
    // `Emby` is only accepted under the legacy flag; `MediaBrowser` always is.
    expect(buildAuthorizationHeader("tok")).toMatch(/^MediaBrowser /);
    expect(buildAuthorizationHeader("tok")).toContain('Token="tok"');
    expect(buildAuthorizationHeader(null)).not.toContain("Token=");
  });
});

describe("jellyfin request interceptor", () => {
  it("authenticates with Authorization and no legacy headers", () => {
    const { headers } = applyInterceptor();
    expect(headers.get("Authorization")).toBe(
      buildAuthorizationHeader("token"),
    );
    // The token already travels inside the header above, so these are not just
    // deprecated but redundant.
    expect(headers.get("X-Emby-Authorization")).toBeUndefined();
    expect(headers.get("X-Emby-Token")).toBeUndefined();
  });

  it("still identifies the client when signed out", () => {
    // AuthenticateByName needs Client/Device/DeviceId from this header before a
    // token exists, so it must be sent even with none.
    mockAuthState.jellyfinAccessToken = null;
    expect(applyInterceptor().headers.get("Authorization")).toBe(
      buildAuthorizationHeader(null),
    );
  });

  it("applies a server's custom headers", () => {
    mockCustomHeaders.value = { "CF-Access-Client-Id": "id" };
    expect(applyInterceptor().headers.get("CF-Access-Client-Id")).toBe("id");
  });

  it("never lets a custom Authorization header shadow the session", () => {
    // Custom headers deliberately win on a name collision (see
    // services/serverHeaders.ts) — except this one, which now carries auth.
    mockCustomHeaders.value = { Authorization: "Bearer proxy-token" };
    expect(applyInterceptor().headers.get("Authorization")).toBe(
      buildAuthorizationHeader("token"),
    );
  });
});
