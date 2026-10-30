// The refresh token rotates on every use, so two requests that 401 together
// must share one refresh — the second presenting a token the first already
// spent would sign the user out.
const mockRequest = jest.fn();
const mockPost = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      create: () => ({
        request: (...args: unknown[]) => mockRequest(...args),
        post: (...args: unknown[]) => mockPost(...args),
      }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));
jest.mock("@/services/serverHeaders", () => ({
  setIntegrationBearer: jest.fn(),
}));
jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  AudiobookshelfSessionExpiredError,
  absRequest,
} from "@/services/audiobookshelf/index";
import { setIntegrationBearer } from "@/services/serverHeaders";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";

const unauthorized = () =>
  Object.assign(new Error("HTTP 401"), {
    isAxiosError: true,
    response: { status: 401 },
  });

function signIn() {
  useAudiobookshelfBase.getState().setSession({
    serverUrl: "http://abs",
    username: "root",
    userId: "u1",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    serverVersion: "2.37.2",
    canDownload: true,
    canDelete: true,
  });
}

const authOf = (call: unknown[]) =>
  (call[0] as { headers: Record<string, string> }).headers.Authorization;

beforeEach(() => {
  mockRequest.mockReset();
  mockPost.mockReset();
  useAudiobookshelfBase.getState().__reset();
  signIn();
});

describe("absRequest", () => {
  it("sends the access token as a bearer", async () => {
    mockRequest.mockResolvedValue({ data: { ok: true } });
    await expect(absRequest("/api/me")).resolves.toEqual({ ok: true });
    expect(authOf(mockRequest.mock.calls[0])).toBe("Bearer old-access");
  });

  it("refreshes once for concurrent 401s, then replays each with the new token", async () => {
    mockRequest.mockImplementation(({ headers }) =>
      headers.Authorization === "Bearer new-access"
        ? Promise.resolve({ data: "ok" })
        : Promise.reject(unauthorized()),
    );
    mockPost.mockResolvedValue({
      data: {
        user: { accessToken: "new-access", refreshToken: "new-refresh" },
      },
    });

    await expect(
      Promise.all([absRequest("/api/a"), absRequest("/api/b")]),
    ).resolves.toEqual(["ok", "ok"]);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][2].headers["x-refresh-token"]).toBe(
      "old-refresh",
    );
    expect(useAudiobookshelfBase.getState()).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      isConnected: true,
    });
  });

  it("replays only once when the new token is refused too", async () => {
    mockRequest.mockRejectedValue(unauthorized());
    mockPost.mockResolvedValue({
      data: {
        user: { accessToken: "new-access", refreshToken: "new-refresh" },
      },
    });
    await expect(absRequest("/api/me")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("disconnects when the refresh token itself is refused", async () => {
    mockRequest.mockRejectedValue(unauthorized());
    mockPost.mockRejectedValue(unauthorized());
    await expect(absRequest("/api/me")).rejects.toBeInstanceOf(
      AudiobookshelfSessionExpiredError,
    );
    expect(useAudiobookshelfBase.getState().isConnected).toBe(false);
  });

  it("stays connected when the refresh merely can't reach the server", async () => {
    mockRequest.mockRejectedValue(unauthorized());
    mockPost.mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true }),
    );
    await expect(absRequest("/api/me")).rejects.toThrow("Network Error");
    expect(useAudiobookshelfBase.getState().isConnected).toBe(true);
  });

  it("publishes the token for native fetchers, and withdraws it on disconnect", () => {
    expect(setIntegrationBearer).toHaveBeenLastCalledWith("audiobookshelf", {
      baseUrl: "http://abs",
      accessToken: "old-access",
    });
    useAudiobookshelfBase.getState().setConnected(false);
    expect(setIntegrationBearer).toHaveBeenLastCalledWith(
      "audiobookshelf",
      null,
    );
  });
});
