// The sound-alike search is the one AudioMuse surface whose two toggles are
// tri-state on the wire: omitting a flag hands the deployment's own default
// back, so a toggle that doesn't reach the query string silently does nothing.
// A 404 is also load-bearing here — AudioMuse answers it for "not in the index"
// as well as "nothing matched", neither of which is an error to raise.
const mockRequest = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      create: () => ({
        request: (...args: unknown[]) => mockRequest(...args),
      }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));

jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  clampSimilarResults,
  findSimilarTracks,
  SIMILAR_DEFAULT_RESULTS,
  SIMILAR_MAX_RESULTS,
  SIMILAR_MIN_RESULTS,
} from "@/services/audioMuse/similar";
import {
  selectSimilarTracksAvailable,
  useAudioMuseBase,
} from "@/stores/audioMuse";

const lastRequest = () => mockRequest.mock.calls.at(-1)?.[0];

const httpError = (status: number) => {
  const error = new Error(
    `Request failed with status code ${status}`,
  ) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: unknown };
  };
  error.isAxiosError = true;
  error.response = { status, data: {} };
  return error;
};

const search = (overrides: Record<string, unknown> = {}) =>
  findSimilarTracks({
    itemId: "seed-1",
    numResults: 25,
    limitPerArtist: true,
    radiusSimilarity: true,
    ...overrides,
  });

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ data: [] });
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("clampSimilarResults", () => {
  it("holds the count inside what the endpoint accepts", () => {
    expect(clampSimilarResults(0)).toBe(SIMILAR_MIN_RESULTS);
    expect(clampSimilarResults(5000)).toBe(SIMILAR_MAX_RESULTS);
    expect(clampSimilarResults(12.4)).toBe(12);
  });

  // The field can be emptied while typing, which reaches here as NaN.
  it("falls back to the default when the field holds no number", () => {
    expect(clampSimilarResults(Number.NaN)).toBe(SIMILAR_DEFAULT_RESULTS);
  });
});

describe("findSimilarTracks", () => {
  it("sends both toggles explicitly rather than letting the server default", async () => {
    await search({ limitPerArtist: false, radiusSimilarity: true });

    expect(lastRequest()).toMatchObject({
      url: "/api/similar_tracks",
      params: {
        item_id: "seed-1",
        n: 25,
        eliminate_duplicates: "false",
        radius_similarity: "true",
      },
    });
  });

  it("clamps the requested count before it reaches the wire", async () => {
    await search({ numResults: 9999 });

    expect(lastRequest()?.params?.n).toBe(SIMILAR_MAX_RESULTS);
  });

  // GET calls carry the media-server selection as a query param; without it
  // AudioMuse answers with ids from whichever library it defaults to.
  it("scopes the search to the selected media server", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");

    await search();

    expect(lastRequest()?.params?.server).toBe("srv-2");
  });

  it("drops the seed track from the results", async () => {
    mockRequest.mockResolvedValue({
      data: [{ item_id: "seed-1" }, { item_id: "t-2" }, { item_id: "" }],
    });

    await expect(search()).resolves.toEqual([{ item_id: "t-2" }]);
  });

  it("reads a 404 as no matches rather than a failure", async () => {
    mockRequest.mockRejectedValue(httpError(404));

    await expect(search()).resolves.toEqual([]);
  });

  it("still raises anything else", async () => {
    mockRequest.mockRejectedValue(httpError(500));

    await expect(search()).rejects.toThrow();
  });
});

describe("selectSimilarTracksAvailable", () => {
  it("needs a connection", () => {
    expect(
      selectSimilarTracksAvailable({
        isConnected: false,
        analyzedTrackCount: 500,
      }),
    ).toBe(false);
  });

  it("hides the feature only when the analysis is provably empty", () => {
    expect(
      selectSimilarTracksAvailable({
        isConnected: true,
        analyzedTrackCount: 0,
      }),
    ).toBe(false);
    // Null is "the deployment didn't say", which is not a reason to hide it.
    expect(
      selectSimilarTracksAvailable({
        isConnected: true,
        analyzedTrackCount: null,
      }),
    ).toBe(true);
  });
});
