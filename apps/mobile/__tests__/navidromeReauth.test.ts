jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

jest.mock("@/services/navidrome/auth", () => ({
  reauthenticateNavidrome: jest.fn(),
  nativeLogin: jest.fn(),
}));

import type { AxiosRequestConfig, AxiosResponse } from "axios";
import axios from "axios";
import navidromeApiInstance from "@/services/navidrome";
import { reauthenticateNavidrome } from "@/services/navidrome/auth";
import { useAuthBase } from "@/stores/auth";

const reauth = reauthenticateNavidrome as jest.MockedFunction<
  typeof reauthenticateNavidrome
>;

const authHeaderOf = (config: AxiosRequestConfig): string | undefined => {
  const headers = config.headers as
    | { get?: (name: string) => unknown; Authorization?: unknown }
    | undefined;
  const value = headers?.get?.("Authorization") ?? headers?.Authorization;
  return value == null ? undefined : String(value);
};

const unauthorized = (config: AxiosRequestConfig) =>
  new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config as never, {}, {
    status: 401,
    statusText: "Unauthorized",
    headers: {},
    config,
    data: {},
  } as AxiosResponse);

// Records the Authorization header each adapter call saw, so tests can assert
// the replayed request carried the refreshed token.
let sentAuth: (string | undefined)[] = [];

beforeEach(() => {
  reauth.mockReset();
  sentAuth = [];
  useAuthBase.setState(
    {
      url: "https://navidrome.example",
      username: "joel",
      password: "hunter2",
      isAuthenticated: true,
      serverType: "navidrome",
      token: "expired-token",
      userId: "u1",
      isAdmin: false,
      hasNavidromeNative: true,
    },
    false,
  );
});

afterEach(() => {
  navidromeApiInstance.defaults.adapter = undefined;
});

describe("navidrome native 401 auto-reauth interceptor", () => {
  it("re-acquires the token and replays the request on a 401", async () => {
    reauth.mockImplementation(async () => {
      useAuthBase.getState().setNavidromeSession({
        token: "fresh-token",
        userId: "u1",
        isAdmin: false,
      });
      return "fresh-token";
    });

    let call = 0;
    navidromeApiInstance.defaults.adapter = async (config) => {
      call += 1;
      sentAuth.push(authHeaderOf(config));
      if (call === 1) throw unauthorized(config);
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        data: [{ id: "s1" }],
      } as AxiosResponse;
    };

    const rsp = await navidromeApiInstance.get("/song");

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(sentAuth[0]).toBe("Bearer expired-token");
    expect(sentAuth[1]).toBe("Bearer fresh-token");
    expect(rsp.data).toEqual([{ id: "s1" }]);
  });

  it("acquires a token on the first call when the session has none (post-upgrade)", async () => {
    useAuthBase.setState({ token: null, hasNavidromeNative: false }, false);
    reauth.mockImplementation(async () => {
      useAuthBase.getState().setNavidromeSession({
        token: "fresh-token",
        userId: "u1",
        isAdmin: false,
      });
      return "fresh-token";
    });

    let call = 0;
    navidromeApiInstance.defaults.adapter = async (config) => {
      call += 1;
      sentAuth.push(authHeaderOf(config));
      if (call === 1) throw unauthorized(config);
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        data: [],
      } as AxiosResponse;
    };

    await navidromeApiInstance.get("/song");

    expect(sentAuth[0]).toBeUndefined();
    expect(sentAuth[1]).toBe("Bearer fresh-token");
  });

  it("clears the session and does not loop when re-auth fails", async () => {
    reauth.mockResolvedValue(null);

    let call = 0;
    navidromeApiInstance.defaults.adapter = async (config) => {
      call += 1;
      throw unauthorized(config);
    };

    await expect(navidromeApiInstance.get("/song")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(call).toBe(1);
    expect(useAuthBase.getState().token).toBeNull();
    expect(useAuthBase.getState().hasNavidromeNative).toBe(false);
  });

  it("does not retry more than once if the fresh token is also rejected", async () => {
    reauth.mockResolvedValue("still-bad-token");

    let call = 0;
    navidromeApiInstance.defaults.adapter = async (config) => {
      call += 1;
      throw unauthorized(config);
    };

    await expect(navidromeApiInstance.get("/song")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(call).toBe(2);
    expect(useAuthBase.getState().token).toBeNull();
  });
});
