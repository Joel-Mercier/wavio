// The rate-limited queue can only refuse to *start* a request, so the abort
// signal has to reach axios too or a cancel leaves the in-flight request running
// to its 15s timeout. Cancellation then arrives as two different error types —
// axios's CanceledError and the queue's AbortedError — which this boundary
// normalises to one so callers have a single thing to recognise.
const mockGet = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  class CanceledError extends Error {
    __CANCEL__ = true;
  }
  return {
    __esModule: true,
    default: {
      // Forwarded through a closure rather than handed over directly: the
      // service calls axios.create() at import time, which runs before the
      // `const mockGet` above is initialised.
      create: () => ({
        get: (...args: unknown[]) => mockGet(...args),
      }),
      isCancel: (e: unknown) =>
        Boolean((e as { __CANCEL__?: boolean })?.__CANCEL__),
      isAxiosError,
      CanceledError,
    },
    isCancel: (e: unknown) =>
      Boolean((e as { __CANCEL__?: boolean })?.__CANCEL__),
    isAxiosError,
    CanceledError,
  };
});

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.0" }));

// The real queue spaces request starts a second apart, which would put a
// pointless second on every test here. The spacing itself is covered by
// rateLimitedQueue.test.ts; what matters for this file is that the signal is
// still honoured before a task starts, so that behaviour is kept.
jest.mock("@/utils/rateLimitedQueue", () => {
  const actual = jest.requireActual("@/utils/rateLimitedQueue");
  return {
    ...actual,
    createRateLimitedQueue: () => ({
      run: async (task: () => Promise<unknown>, signal?: AbortSignal) => {
        if (signal?.aborted) throw new actual.AbortedError();
        return task();
      },
      pending: () => 0,
    }),
  };
});

import axios from "axios";
import { musicBrainzRequest } from "@/services/musicbrainz";
import { AbortedError } from "@/utils/rateLimitedQueue";

const axiosError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status },
  });

beforeEach(() => {
  mockGet.mockReset();
});

describe("musicBrainzRequest", () => {
  it("hands the abort signal to axios, not just the queue", async () => {
    mockGet.mockResolvedValue({ data: { ok: true } });
    const controller = new AbortController();

    await musicBrainzRequest("/release", { query: "x" }, controller.signal);

    expect(mockGet).toHaveBeenCalledWith(
      "/release",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("still sends the JSON format param", async () => {
    mockGet.mockResolvedValue({ data: {} });

    await musicBrainzRequest("/release", { query: "x" });

    expect(mockGet).toHaveBeenCalledWith(
      "/release",
      expect.objectContaining({
        params: expect.objectContaining({ query: "x", fmt: "json" }),
      }),
    );
  });

  it("reports an axios cancellation as AbortedError", async () => {
    // Without this the scan loop sees an unrecognised error, reports the user's
    // own cancel to Sentry and counts the album as unmatched.
    const controller = new AbortController();
    mockGet.mockImplementation(async () => {
      controller.abort();
      throw new axios.CanceledError("canceled");
    });

    await expect(
      musicBrainzRequest("/release", {}, controller.signal),
    ).rejects.toBeInstanceOf(AbortedError);
  });

  it("reports a failure during an abort as AbortedError", async () => {
    // A socket torn down by the abort surfaces as a network error rather than a
    // cancellation; with the signal aborted it is still a cancellation.
    const controller = new AbortController();
    mockGet.mockImplementation(async () => {
      controller.abort();
      throw new Error("Network Error");
    });

    await expect(
      musicBrainzRequest("/release", {}, controller.signal),
    ).rejects.toBeInstanceOf(AbortedError);
  });

  it("retries once on a 503, which is the rate limiter talking", async () => {
    mockGet
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce({ data: { ok: true } });

    await expect(musicBrainzRequest("/release", {})).resolves.toEqual({
      ok: true,
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("does not retry a cancelled request", async () => {
    // The retry would otherwise spend rate budget on a scan the user stopped.
    const controller = new AbortController();
    mockGet.mockImplementation(async () => {
      controller.abort();
      throw axiosError(503);
    });

    await expect(
      musicBrainzRequest("/release", {}, controller.signal),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("lets a genuine failure through untouched", async () => {
    mockGet.mockRejectedValue(axiosError(400));

    await expect(musicBrainzRequest("/release", {})).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});
