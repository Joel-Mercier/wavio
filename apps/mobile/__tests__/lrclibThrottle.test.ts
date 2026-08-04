// LRCLIB sits behind Cloudflare, and a lyrics lookup fans out to one /api/get
// plus up to six /api/search variants — enough to earn a 403 within a few
// tracks. A block has to behave like a miss (lyrics are optional) and, above
// all, has to stop the fan-out: retrying the remaining candidates against a
// rate-limiter is what sustains the block and what buried Sentry under a
// thousand identical events.
const mockGet = jest.fn();
const mockReportError = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      create: () => ({ get: (...args: unknown[]) => mockGet(...args) }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

function httpError(status: number) {
  return { isAxiosError: true, response: { status } };
}

const PARAMS = {
  trackName: "Windy Lady",
  artistName: "Tatsuro Yamashita",
  albumName: "Come Along",
  duration: 304,
};

function importLyrics(): typeof import("@/services/lrclib/lyrics") {
  // The cooldown is module state — a fresh module per test keeps them isolated.
  jest.resetModules();
  return require("@/services/lrclib/lyrics");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getLrclibLyrics under a Cloudflare block", () => {
  it("returns no lyrics on a 403 without reporting it", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet.mockRejectedValue(httpError(403));

    await expect(getLrclibLyrics(PARAMS)).resolves.toBeNull();
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("stops the search fan-out at the first 403 instead of retrying every candidate", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet.mockRejectedValue(httpError(403));

    await getLrclibLyrics(PARAMS);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("stops calling at all for the next track once blocked", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet.mockRejectedValue(httpError(429));

    await getLrclibLyrics(PARAMS);
    mockGet.mockClear();
    await expect(
      getLrclibLyrics({ ...PARAMS, trackName: "Another Song" }),
    ).resolves.toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  // useLrclibLyrics caches with an infinite staleTime, so it has to tell a null
  // that means "the server has no lyrics" from a null that means "we never
  // asked" — otherwise every track opened during a block is pinned to "no
  // lyrics" for the life of the cache, long after the block lifts.
  it("reports the cooldown so callers don't cache the block as a miss", async () => {
    const { getLrclibLyrics, isLrclibThrottled } = importLyrics();
    expect(isLrclibThrottled()).toBe(false);

    mockGet.mockRejectedValue(httpError(403));
    await getLrclibLyrics(PARAMS);

    expect(isLrclibThrottled()).toBe(true);
  });

  it("leaves a genuine miss distinguishable from a block", async () => {
    const { getLrclibLyrics, isLrclibThrottled } = importLyrics();
    mockGet.mockRejectedValue(httpError(404));

    await expect(getLrclibLyrics(PARAMS)).resolves.toBeNull();
    expect(isLrclibThrottled()).toBe(false);
  });

  it("still falls back to search on a 404, and still reports a real failure", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet
      .mockRejectedValueOnce(httpError(404))
      .mockRejectedValue(httpError(500));

    await expect(getLrclibLyrics(PARAMS)).rejects.toBeDefined();
    expect(mockGet.mock.calls.length).toBeGreaterThan(1);
    expect(mockReportError).toHaveBeenCalled();
  });
});

// LRCLIB's edge answers 520 for some /api/get queries whose track /api/search
// serves fine (Sultans Of Swing did exactly this). /api/get is only ever an
// optimization, so its failure must never end the lookup.
describe("getLrclibLyrics when /api/get fails for a non-404 reason", () => {
  const record = {
    id: 36847085,
    duration: 354,
    syncedLyrics: "[00:10.00]You get a shiver in the dark",
  };

  it.each([520, 500, 502])(
    "falls through to search on a %s instead of aborting",
    async (status) => {
      const { getLrclibLyrics } = importLyrics();
      mockGet
        .mockRejectedValueOnce(httpError(status))
        .mockResolvedValue({ data: [record] });

      await expect(getLrclibLyrics(PARAMS)).resolves.toMatchObject({
        id: record.id,
      });
      expect(mockGet.mock.calls.length).toBeGreaterThan(1);
    },
  );

  it("still reports the /api/get failure it recovered from", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet
      .mockRejectedValueOnce(httpError(520))
      .mockResolvedValue({ data: [record] });

    await getLrclibLyrics(PARAMS);
    expect(mockReportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endpoint: "/api/get" }),
    );
  });

  it("does not fall through when the failure is a block", async () => {
    const { getLrclibLyrics } = importLyrics();
    mockGet.mockRejectedValue(httpError(429));

    await expect(getLrclibLyrics(PARAMS)).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
