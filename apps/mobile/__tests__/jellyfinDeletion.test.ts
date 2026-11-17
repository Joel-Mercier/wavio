// Jellyfin answers a delete the user may not make with 401, the status its
// response interceptor otherwise reads as a dead token and signs out on. A
// refused delete must fail on its own and leave the session alone.

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock("@/services/network", () => ({ USER_AGENT: "Wavio/test" }));

jest.mock("@/services/jellyfin/deviceId", () => ({
  getDeviceId: () => "device",
}));

jest.mock("@/services/serverHeaders", () => ({
  customHeadersForUrl: () => undefined,
}));

const mockLogout = jest.fn();
const mockSetSession = jest.fn();
const mockAuth = { isAdmin: true };
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      isAdmin: mockAuth.isAdmin,
      url: "http://server/",
      jellyfinAccessToken: "token",
      jellyfinUserId: "user-1",
      setJellyfinSession: mockSetSession,
      logout: mockLogout,
    }),
  },
}));

import { AxiosError, type AxiosResponse } from "axios";
import {
  canDeleteItem,
  deleteTrack,
  refreshAfterDelete,
} from "@/services/jellyfin/deletion";
import jellyfinApiInstance from "@/services/jellyfin/index";

const answer = (status: number, data: unknown = {}) => {
  jellyfinApiInstance.defaults.adapter = async (config) => {
    const response = {
      status,
      statusText: String(status),
      data,
      headers: {},
      config,
    } as AxiosResponse;
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        String(status),
        config,
        null,
        response,
      );
    }
    return response;
  };
};

let lastRequest: { method?: string; url?: string; params?: unknown } = {};
jellyfinApiInstance.interceptors.request.use((config) => {
  lastRequest = {
    method: config.method,
    url: config.url,
    params: config.params,
  };
  return config;
});

const requests: { method?: string; url?: string }[] = [];
jellyfinApiInstance.interceptors.request.use((config) => {
  requests.push({ method: config.method, url: config.url });
  return config;
});

beforeEach(() => {
  jest.clearAllMocks();
  lastRequest = {};
  requests.length = 0;
  mockAuth.isAdmin = true;
});

describe("deleteTrack", () => {
  it("deletes the track item", async () => {
    answer(204);
    await deleteTrack("track-1");
    expect(lastRequest).toMatchObject({
      method: "delete",
      url: "/Items/track-1",
    });
  });

  it.each([401, 403])(
    "fails a refused delete (HTTP %i) without signing out",
    async (status) => {
      answer(status);
      await expect(deleteTrack("track-1")).rejects.toBeInstanceOf(AxiosError);
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockSetSession).not.toHaveBeenCalled();
      expect(mockReportError).not.toHaveBeenCalled();
    },
  );

  it("leaves a server error to the caller to report", async () => {
    answer(500);
    await expect(deleteTrack("track-1")).rejects.toBeInstanceOf(AxiosError);
    expect(mockReportError).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("treats an item that is already gone as deleted", async () => {
    answer(404);
    await expect(deleteTrack("track-1")).resolves.toBeUndefined();
  });

  it("still signs out on a 401 from an ordinary request", async () => {
    answer(401);
    await expect(jellyfinApiInstance.get("/Items")).rejects.toBeInstanceOf(
      AxiosError,
    );
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe("canDeleteItem", () => {
  it("asks the server for the item's CanDelete", async () => {
    answer(200, { CanDelete: true });
    expect(await canDeleteItem("album-1")).toBe(true);
    expect(lastRequest).toMatchObject({
      url: "/Users/user-1/Items/album-1",
      params: { Fields: "CanDelete" },
    });
  });

  it("is false when the server doesn't say yes", async () => {
    answer(200, {});
    expect(await canDeleteItem("album-1")).toBe(false);
  });
});

describe("refreshAfterDelete", () => {
  const scanTask = (state: string, end?: string) => [
    { Key: "Other", State: "Idle" },
    {
      Key: "RefreshLibrary",
      State: state,
      LastExecutionResult: end ? { EndTimeUtc: end } : undefined,
    },
  ];

  const serve = (scans: ReturnType<typeof scanTask>[]) => {
    jellyfinApiInstance.defaults.adapter = async (config) => {
      const data =
        config.url === "/ScheduledTasks" ? (scans.shift() ?? scans[0]) : {};
      return { status: 200, statusText: "OK", data, headers: {}, config };
    };
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("starts a library scan and waits for it to finish", async () => {
    serve([
      scanTask("Idle", "2026-11-14T10:00:00Z"),
      scanTask("Running", "2026-11-14T10:00:00Z"),
      scanTask("Idle", "2026-11-14T10:05:00Z"),
    ]);
    const done = refreshAfterDelete(["album-1"]);
    await jest.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBe(true);
    expect(requests).toContainEqual({
      method: "post",
      url: "/Library/Refresh",
    });
  });

  it("gives up waiting on a scan that never finishes", async () => {
    serve([scanTask("Running")]);
    const done = refreshAfterDelete(["album-1"]);
    await jest.advanceTimersByTimeAsync(125_000);
    await expect(done).resolves.toBe(false);
  });

  it("leaves the library alone for a user who isn't an administrator", async () => {
    mockAuth.isAdmin = false;
    await expect(refreshAfterDelete(["album-1"])).resolves.toBe(false);
    expect(requests).toEqual([]);
  });

  it("leaves the library alone when no album was emptied", async () => {
    await expect(refreshAfterDelete([])).resolves.toBe(false);
    expect(requests).toEqual([]);
  });
});
