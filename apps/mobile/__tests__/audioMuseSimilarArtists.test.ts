// AudioMuse indexes artists by *name* — an id only gets resolved back to one
// through its media-server registry, a hop that fails for artists it can't map —
// so which identifier reaches the wire decides whether the row has any content.
// The two "empty" statuses matter just as much: 404 is an artist absent from the
// index, 503 is an index the operator never built, and neither is an error the
// artist screen can do anything with.
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

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
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
  findSimilarArtists,
  SIMILAR_ARTISTS_DEFAULT_RESULTS,
} from "@/services/audioMuse/artists";
import {
  selectSimilarArtistsAvailable,
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

beforeEach(() => {
  mockRequest.mockReset();
  mockReportError.mockReset();
  mockRequest.mockResolvedValue({ data: [] });
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("findSimilarArtists", () => {
  it("queries by name, which is what the index is keyed by", async () => {
    await findSimilarArtists({ artistName: "  Boards of Canada  " });

    expect(lastRequest()).toMatchObject({
      url: "/api/similar_artists",
      params: {
        artist: "Boards of Canada",
        n: SIMILAR_ARTISTS_DEFAULT_RESULTS,
      },
    });
    // `artist` wins server-side, so sending the id too would be dead weight.
    expect(lastRequest()?.params?.artist_id).toBeUndefined();
  });

  it("falls back to the id only when there is no name", async () => {
    await findSimilarArtists({ artistId: "ar-9" });

    expect(lastRequest()?.params).toMatchObject({ artist_id: "ar-9" });
    expect(lastRequest()?.params?.artist).toBeUndefined();
  });

  it("asks for nothing when it has neither identifier", async () => {
    await expect(findSimilarArtists({ artistName: "   " })).resolves.toEqual(
      [],
    );

    expect(mockRequest).not.toHaveBeenCalled();
  });

  // GET calls carry the media-server selection as a query param; without it
  // AudioMuse resolves artist ids against whichever library it defaults to.
  it("scopes the search to the selected media server", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");

    await findSimilarArtists({ artistName: "Aphex Twin" });

    expect(lastRequest()?.params?.server).toBe("srv-2");
  });

  it("passes the requested count through", async () => {
    await findSimilarArtists({ artistName: "Aphex Twin", numResults: 4 });

    expect(lastRequest()?.params?.n).toBe(4);
  });

  it("drops rows with no artist name, the one field it can't work without", async () => {
    mockRequest.mockResolvedValue({
      data: [{ artist: "Plaid" }, { artist: "", artist_id: "ar-3" }],
    });

    await expect(
      findSimilarArtists({ artistName: "Aphex Twin" }),
    ).resolves.toEqual([{ artist: "Plaid" }]);
  });

  it("reads a 404 as no matches rather than a failure", async () => {
    mockRequest.mockRejectedValue(httpError(404));

    await expect(
      findSimilarArtists({ artistName: "Aphex Twin" }),
    ).resolves.toEqual([]);
  });

  // The artist index is a separate build step from the analysis, so a deployment
  // can have the feature and still answer 503 until the operator runs it.
  it("reads a 503 as an unbuilt index rather than a failure", async () => {
    mockRequest.mockRejectedValue(httpError(503));

    await expect(
      findSimilarArtists({ artistName: "Aphex Twin" }),
    ).resolves.toEqual([]);
  });

  it("keeps both expected statuses out of Sentry", async () => {
    for (const status of [404, 503]) {
      mockRequest.mockRejectedValue(httpError(status));
      await findSimilarArtists({ artistName: "Aphex Twin" });
    }

    expect(mockReportError).toHaveBeenCalledTimes(2);
    for (const [, context] of mockReportError.mock.calls) {
      expect(context).toMatchObject({
        notFoundIsExpected: true,
        serviceUnavailableIsExpected: true,
      });
    }
  });

  it("still raises anything else", async () => {
    mockRequest.mockRejectedValue(httpError(500));

    await expect(
      findSimilarArtists({ artistName: "Aphex Twin" }),
    ).rejects.toThrow();
  });
});

describe("selectSimilarArtistsAvailable", () => {
  const available = {
    isConnected: true,
    artistSimilarityEnabled: true,
    analyzedTrackCount: 500,
  };

  it("needs a connection", () => {
    expect(
      selectSimilarArtistsAvailable({ ...available, isConnected: false }),
    ).toBe(false);
  });

  // Older deployments 404 the whole blueprint, so the row would never fill.
  it("needs the deployment to carry the blueprint", () => {
    expect(
      selectSimilarArtistsAvailable({
        ...available,
        artistSimilarityEnabled: false,
      }),
    ).toBe(false);
  });

  it("hides the feature only when the analysis is provably empty", () => {
    expect(
      selectSimilarArtistsAvailable({ ...available, analyzedTrackCount: 0 }),
    ).toBe(false);
    // Null is "the deployment didn't say", which is not a reason to hide it.
    expect(
      selectSimilarArtistsAvailable({ ...available, analyzedTrackCount: null }),
    ).toBe(true);
    expect(selectSimilarArtistsAvailable(available)).toBe(true);
  });
});
