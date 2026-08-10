// searchLrclibRecords backs the manual lyrics picker. Unlike the automatic
// lookup it must stay cheap — the picker is one tap away on the player, and a
// wide fan-out per open is exactly how the device earns a Cloudflare block.
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

const PARAMS = {
  trackName: "Sultans Of Swing (Remastered 2011)",
  artistName: "Dire Straits feat. Nobody",
  duration: 348,
};

const synced = {
  id: 1,
  trackName: "Sultans Of Swing",
  artistName: "Dire Straits",
  duration: 400,
  syncedLyrics: "[00:10.00]You get a shiver in the dark",
};
const plainClose = {
  id: 2,
  trackName: "Sultans Of Swing",
  artistName: "Dire Straits",
  duration: 349,
  plainLyrics: "You get a shiver in the dark",
};
const plainFar = {
  id: 3,
  trackName: "Sultans Of Swing (Live)",
  artistName: "Dire Straits",
  duration: 600,
  plainLyrics: "You get a shiver in the dark",
};
const instrumental = {
  id: 4,
  trackName: "Sultans Of Swing",
  artistName: "Dire Straits",
  duration: 348,
  instrumental: true,
  plainLyrics: null,
  syncedLyrics: null,
};

function importLyrics(): typeof import("@/services/lrclib/lyrics") {
  // The cooldown is module state — a fresh module per test keeps them isolated.
  jest.resetModules();
  return require("@/services/lrclib/lyrics");
}

function httpError(status: number) {
  return { isAxiosError: true, response: { status } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("searchLrclibRecords", () => {
  it("asks once, with the track and artist loosened", async () => {
    const { searchLrclibRecords } = importLyrics();
    mockGet.mockResolvedValue({ data: [plainClose] });

    await searchLrclibRecords(PARAMS);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/search", {
      params: {
        track_name: "Sultans Of Swing",
        artist_name: "Dire Straits",
      },
    });
  });

  it("orders synced first, then by closest duration", async () => {
    const { searchLrclibRecords } = importLyrics();
    mockGet.mockResolvedValue({ data: [plainFar, plainClose, synced] });

    const results = await searchLrclibRecords(PARAMS);
    expect(results.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("drops records with no lyrics and de-duplicates by id", async () => {
    const { searchLrclibRecords } = importLyrics();
    mockGet.mockResolvedValue({
      data: [instrumental, plainClose, { ...plainClose, duration: 111 }],
    });

    const results = await searchLrclibRecords(PARAMS);
    expect(results.map((r) => r.id)).toEqual([2]);
    expect(results[0].duration).toBe(349);
  });

  it("falls back to a free-text query only when the structured search is empty", async () => {
    const { searchLrclibRecords } = importLyrics();
    mockGet
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [synced] });

    const results = await searchLrclibRecords(PARAMS);

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenLastCalledWith("/api/search", {
      params: { q: "Sultans Of Swing Dire Straits" },
    });
    expect(results.map((r) => r.id)).toEqual([1]);
  });

  it("stops at the first request when it is blocked", async () => {
    const { searchLrclibRecords, isLrclibThrottled } = importLyrics();
    mockGet.mockRejectedValue(httpError(403));

    await expect(searchLrclibRecords(PARAMS)).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(isLrclibThrottled()).toBe(true);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("asks nothing at all while a block is still in force", async () => {
    const { searchLrclibRecords } = importLyrics();
    mockGet.mockRejectedValue(httpError(429));
    await searchLrclibRecords(PARAMS);

    mockGet.mockClear();
    await expect(searchLrclibRecords(PARAMS)).resolves.toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
