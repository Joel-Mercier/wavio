jest.mock("@/services/backend/browsing", () => ({
  getSimilarSongs2: jest.fn(),
  getSonicSimilarTracks: jest.fn(),
}));
jest.mock("@/services/lastFm/recommendations", () => ({
  fetchLastFmSimilarSongs: jest.fn(),
}));
jest.mock("@/stores/serverExtensions", () => ({
  useServerExtensionsBase: {
    getState: () => ({ hasExtension: () => mockHasSonicSimilarity }),
  },
}));

let mockHasSonicSimilarity = false;

import {
  getSimilarSongs2,
  getSonicSimilarTracks,
} from "@/services/backend/browsing";
import { fetchLastFmSimilarSongs } from "@/services/lastFm/recommendations";
import { fetchSimilarSongs } from "@/services/similarSongs";

const mockSonic = getSonicSimilarTracks as jest.Mock;
const mockSubsonic = getSimilarSongs2 as jest.Mock;
const mockLastFm = fetchLastFmSimilarSongs as jest.Mock;

const seed = { title: "Alive", artist: "Pearl Jam" };

beforeEach(() => {
  mockSonic.mockReset();
  mockSubsonic.mockReset();
  mockLastFm.mockReset();
  mockHasSonicSimilarity = false;
  mockSonic.mockResolvedValue({});
  mockSubsonic.mockResolvedValue({});
  mockLastFm.mockResolvedValue([]);
});

describe("fetchSimilarSongs", () => {
  it("uses sonicSimilarity when the server advertises it", async () => {
    mockHasSonicSimilarity = true;
    mockSonic.mockResolvedValue({
      sonicSimilarTracks: { sonicMatch: [{ entry: { id: "sonic-1" } }] },
    });

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([
      { id: "sonic-1" },
    ]);
    expect(mockSubsonic).not.toHaveBeenCalled();
    expect(mockLastFm).not.toHaveBeenCalled();
  });

  it("falls back to getSimilarSongs2", async () => {
    mockSubsonic.mockResolvedValue({
      similarSongs2: { song: [{ id: "sub-1" }] },
    });

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([
      { id: "sub-1" },
    ]);
    expect(mockLastFm).not.toHaveBeenCalled();
  });

  // The point of the tier: a plain Subsonic server or a local library returns an
  // empty list rather than an error, so a "no results" answer has to fall
  // through as surely as a rejection does.
  it("falls through to Last.fm when getSimilarSongs2 returns nothing", async () => {
    mockSubsonic.mockResolvedValue({ similarSongs2: { song: [] } });
    mockLastFm.mockResolvedValue([{ id: "lfm-1" }]);

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([
      { id: "lfm-1" },
    ]);
    expect(mockLastFm).toHaveBeenCalledWith(seed, { count: 20 });
  });

  it("falls through to Last.fm when getSimilarSongs2 rejects", async () => {
    mockSubsonic.mockRejectedValue(new Error("plugin timed out"));
    mockLastFm.mockResolvedValue([{ id: "lfm-1" }]);

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([
      { id: "lfm-1" },
    ]);
  });

  it("falls through when sonicSimilarity answers empty", async () => {
    mockHasSonicSimilarity = true;
    mockSonic.mockResolvedValue({ sonicSimilarTracks: { sonicMatch: [] } });
    mockSubsonic.mockResolvedValue({
      similarSongs2: { song: [{ id: "sub-1" }] },
    });

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([
      { id: "sub-1" },
    ]);
  });

  it("degrades to an empty list rather than throwing", async () => {
    mockSubsonic.mockRejectedValue(new Error("down"));
    mockLastFm.mockRejectedValue(new Error("also down"));

    expect(await fetchSimilarSongs("track-1", 20, seed)).toEqual([]);
  });

  it("still calls the Last.fm tier with no seed, which handles it itself", async () => {
    await fetchSimilarSongs("track-1", 20);

    expect(mockLastFm).toHaveBeenCalledWith(undefined, { count: 20 });
  });
});
