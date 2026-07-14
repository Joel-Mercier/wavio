const mockCapture = jest.fn();
const mockSetTag = jest.fn();
const mockSetContext = jest.fn();
const mockSetFingerprint = jest.fn();
const mockAddBreadcrumb = jest.fn();

jest.mock("@sentry/react-native", () => ({
  captureException: (...args: unknown[]) => mockCapture(...args),
  withScope: (cb: (scope: unknown) => void) =>
    cb({
      setTag: mockSetTag,
      setContext: mockSetContext,
      setFingerprint: mockSetFingerprint,
    }),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}));

const mockNet = { online: true, reachable: true };
jest.mock("@/services/network", () => ({
  getIsOnline: () => mockNet.online,
  getServerReachable: () => mockNet.reachable,
}));

import axios from "axios";
import { reportError } from "@/services/errorReporting";
import { logError } from "@/utils/log";

const realDev = (global as { __DEV__?: boolean }).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  mockNet.online = true;
  mockNet.reachable = true;
  // reportError logs to the console in dev; force the production path so we can
  // assert on captureException.
  (global as { __DEV__?: boolean }).__DEV__ = false;
});

afterAll(() => {
  (global as { __DEV__?: boolean }).__DEV__ = realDev;
});

describe("reportError classifier", () => {
  it("suppresses an API failure while the device is offline", () => {
    mockNet.online = false;
    reportError(new Error("boom"), { area: "api", backend: "subsonic" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a connection-level axios error (no response)", () => {
    const error = new axios.AxiosError("Network Error");
    reportError(error, { area: "api", backend: "subsonic" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a backend failure when the server is unreachable", () => {
    mockNet.reachable = false;
    const error = new axios.AxiosError("Request failed");
    error.response = { status: 500 } as never;
    reportError(error, { area: "api", backend: "subsonic" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a 404 when notFoundIsExpected", () => {
    const error = new axios.AxiosError("Not Found");
    error.response = { status: 404 } as never;
    reportError(error, {
      area: "api",
      api: "lrclib",
      notFoundIsExpected: true,
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a 501 (server doesn't implement the endpoint)", () => {
    const error = new axios.AxiosError("Not Implemented");
    error.response = { status: 501 } as never;
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "/rest/getShares",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Cloudflare 530 (origin unreachable) even while the server still reads as reachable", () => {
    const error = new axios.AxiosError("Request failed with status code 530");
    error.response = { status: 530 } as never;
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "/rest/getAlbumList2",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it.each([
    502, 503, 504, 521, 524,
  ])("suppresses a gateway/upstream %s (edge up, origin unreachable)", (status) => {
    const error = new axios.AxiosError(`Request failed with status ${status}`);
    error.response = { status } as never;
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "/rest/getAlbumList2",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("still reports a plain 500 (origin itself erroring, not a gateway)", () => {
    const error = new axios.AxiosError("Request failed with status 500");
    error.response = { status: 500 } as never;
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "/rest/getAlbumList2",
    });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("suppresses a React Query 'Missing queryFn' lifecycle artifact", () => {
    reportError(
      new Error(
        `Missing queryFn: '["albumList2",{"size":12,"type":"recent"}]'`,
      ),
      { area: "api", backend: "subsonic", endpoint: "albumList2" },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Subsonic code-0 'Method not supported' (server doesn't implement it)", () => {
    reportError(
      { code: 0, message: "Method not supported: getNowPlaying" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getNowPlaying",
        status: 0,
      },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Subsonic code -1 'Invalid or empty response' (proxy returned non-JSON)", () => {
    reportError(
      { code: -1, message: "Invalid or empty response from server" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getAlbumList2",
        status: -1,
      },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Subsonic 'not authorized' (code 50) denial", () => {
    reportError(
      { code: 50, message: "user not authorized" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/createShare",
        status: 50,
      },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Subsonic 'data not found' (code 70) when notFoundIsExpected", () => {
    reportError(
      { code: 70, message: "Library not found or empty" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getArtists",
        status: 70,
        notFoundIsExpected: true,
      },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a Navidrome plugin timeout (code 0 'context deadline exceeded')", () => {
    reportError(
      {
        code: 0,
        message:
          'Internal Server Error: plugin call failed: AudioMuse-AI HTTP request failed: Get "http://192.168.3.203:8000/api/similar_tracks": context deadline exceeded',
      },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getSimilarSongs2",
        status: 0,
      },
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("still reports a non-timeout Subsonic code-0 internal error", () => {
    reportError(
      { code: 0, message: "Internal Server Error" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getSimilarSongs2",
        status: 0,
      },
    );
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("suppresses a by-design LocalUnsupportedError", () => {
    const error = new Error("The local library doesn't support this operation");
    error.name = "LocalUnsupportedError";
    reportError(error, { area: "api", backend: "local", endpoint: "getUser" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a by-design JellyfinUnsupportedError", () => {
    const error = new Error("Jellyfin does not support jukebox");
    error.name = "JellyfinUnsupportedError";
    reportError(error, {
      area: "api",
      backend: "jellyfin",
      endpoint: "jukebox",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses an InvalidFeedError (user pasted a non-RSS URL)", () => {
    const error = new Error("Not a valid RSS podcast feed");
    error.name = "InvalidFeedError";
    reportError(error, {
      area: "local-library",
      backend: "local",
      endpoint: "podcasts/create",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("still reports a local-library failure while offline (no network needed)", () => {
    mockNet.online = false;
    reportError(new Error("scan failed"), { area: "local-library" });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("normalizes a Subsonic envelope error and tags/fingerprints it", () => {
    reportError(
      { code: 70, message: "Data not found" },
      {
        area: "api",
        backend: "subsonic",
        endpoint: "/rest/getAlbum",
        status: 70,
      },
    );
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const reported = mockCapture.mock.calls[0][0] as Error;
    expect(reported).toBeInstanceOf(Error);
    expect(reported.name).toBe("SubsonicError(70)");
    expect(reported.message).toBe("Data not found");
    expect(mockSetTag).toHaveBeenCalledWith("area", "api");
    expect(mockSetTag).toHaveBeenCalledWith("backend", "subsonic");
    expect(mockSetTag).toHaveBeenCalledWith("status", "70");
    expect(mockSetFingerprint).toHaveBeenCalledWith([
      "api",
      "subsonic",
      "/rest/getAlbum",
    ]);
  });

  it("reports a given error object only once (dedupe)", () => {
    const error = new Error("once");
    reportError(error, { area: "player" });
    reportError(error, { area: "player" });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("does not re-report an expected failure when it later reaches a context-poor reporter", () => {
    const error = { code: 50, message: "User is not authorized" };
    // Service chokepoint: full context → classified as expected (code 50) and
    // suppressed, but marked on first sight.
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "/rest/startScan",
      status: 50,
    });
    // React Query cache safety net: only a query key, no status → can no longer
    // tell it was expected, but the first-sight mark makes it skip rather than
    // re-capture the noise.
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: "startScan",
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe("logError", () => {
  it("reports through reportError with an area:ui tag", () => {
    logError("Failed to load screen", new Error("boom"));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockSetTag).toHaveBeenCalledWith("area", "ui");
    const reported = mockCapture.mock.calls[0][0] as Error;
    expect(reported.message).toBe("boom");
  });

  it("coerces a bare non-Error object into a real Error (no '[object Object]')", () => {
    logError({ some: "state", nested: { code: 1 } });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const reported = mockCapture.mock.calls[0][0] as Error;
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).not.toContain("[object Object]");
    expect(reported.message).toContain("some");
  });

  it("suppresses a gateway 5xx passed to logError", () => {
    const error = new axios.AxiosError("Request failed with status 503");
    error.response = { status: 503 } as never;
    logError("mutation failed:", error);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("suppresses a 501 axios error passed to logError (the tagless-dup case)", () => {
    const error = new axios.AxiosError("Not Implemented");
    error.response = { status: 501 } as never;
    logError(error);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
