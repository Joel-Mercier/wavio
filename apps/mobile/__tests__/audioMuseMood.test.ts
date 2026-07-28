// Mood and anchor playlists reuse the similarity endpoint with a vector seed
// instead of a track, which means two things worth pinning down: the seed has to
// serialise into the right parameter family (the server picks its branch purely
// from which params are present), and `radius_similarity` must stay off the wire
// — the endpoint only honours it for the track-seeded branch, so sending it
// would put a toggle in front of the user that does nothing.
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
  findSimilarToSeed,
  getMoodCentroids,
  SIMILAR_MAX_RESULTS,
} from "@/services/audioMuse/similar";
import { useAudioMuseBase } from "@/stores/audioMuse";

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
  mockRequest.mockResolvedValue({ data: [] });
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("findSimilarToSeed", () => {
  it("sends a mood as its name and cluster index", async () => {
    await findSimilarToSeed({
      seed: { kind: "mood", mood: "party", centroidIndex: 4 },
      numResults: 25,
      limitPerArtist: true,
    });

    expect(lastRequest()).toMatchObject({
      url: "/api/similar_tracks",
      params: {
        mood: "party",
        centroid_index: 4,
        n: 25,
        eliminate_duplicates: "true",
      },
    });
    expect(lastRequest()?.params?.anchor_id).toBeUndefined();
    expect(lastRequest()?.params?.item_id).toBeUndefined();
  });

  // Index 0 is a legitimate cluster; a truthiness check on it would drop the
  // parameter and send the server down its track-seeded branch instead.
  it("keeps the first cluster on the wire", async () => {
    await findSimilarToSeed({
      seed: { kind: "mood", mood: "sad", centroidIndex: 0 },
      numResults: 25,
      limitPerArtist: true,
    });

    expect(lastRequest()?.params?.centroid_index).toBe(0);
  });

  it("sends an anchor as its id alone", async () => {
    await findSimilarToSeed({
      seed: { kind: "anchor", id: 9 },
      numResults: 25,
      limitPerArtist: false,
    });

    expect(lastRequest()?.params).toMatchObject({
      anchor_id: 9,
      eliminate_duplicates: "false",
    });
    expect(lastRequest()?.params?.mood).toBeUndefined();
  });

  // The endpoint applies it only when the seed is a track, so offering it here
  // would be a toggle that silently does nothing.
  it("never sends the radius option, which this branch ignores", async () => {
    await findSimilarToSeed({
      seed: { kind: "anchor", id: 1 },
      numResults: 25,
      limitPerArtist: true,
    });

    expect(lastRequest()?.params?.radius_similarity).toBeUndefined();
  });

  it("clamps the requested count before it reaches the wire", async () => {
    await findSimilarToSeed({
      seed: { kind: "mood", mood: "happy", centroidIndex: 1 },
      numResults: 9999,
      limitPerArtist: true,
    });

    expect(lastRequest()?.params?.n).toBe(SIMILAR_MAX_RESULTS);
  });

  it("scopes the search to the selected media server", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");

    await findSimilarToSeed({
      seed: { kind: "anchor", id: 1 },
      numResults: 25,
      limitPerArtist: true,
    });

    expect(lastRequest()?.params?.server).toBe("srv-2");
  });

  it("drops rows without an id", async () => {
    mockRequest.mockResolvedValue({
      data: [{ item_id: "a" }, { item_id: "" }],
    });

    await expect(
      findSimilarToSeed({
        seed: { kind: "mood", mood: "happy", centroidIndex: 0 },
        numResults: 25,
        limitPerArtist: true,
      }),
    ).resolves.toEqual([{ item_id: "a" }]);
  });

  // The endpoint answers 404 for "this vector matched nothing", which is a
  // result rather than a failure — same as the track-seeded search.
  it("reads a 404 as no matches", async () => {
    mockRequest.mockRejectedValue(httpError(404));

    await expect(
      findSimilarToSeed({
        seed: { kind: "anchor", id: 1 },
        numResults: 25,
        limitPerArtist: true,
      }),
    ).resolves.toEqual([]);
  });

  it("still raises anything else", async () => {
    mockRequest.mockRejectedValue(httpError(500));

    await expect(
      findSimilarToSeed({
        seed: { kind: "anchor", id: 1 },
        numResults: 25,
        limitPerArtist: true,
      }),
    ).rejects.toThrow();
  });
});

describe("getMoodCentroids", () => {
  // Read off a file the deployment ships, with no media server involved.
  it("asks deployment-wide, without a server scope", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");
    mockRequest.mockResolvedValue({ data: {} });

    await getMoodCentroids();

    expect(lastRequest()?.url).toBe("/api/mood_centroids");
    expect(lastRequest()?.params?.server).toBeUndefined();
  });

  it("returns the catalogue keyed by mood", async () => {
    mockRequest.mockResolvedValue({
      data: { happy: [{ index: 0, top_tags: ["pop"], n_songs: 12 }] },
    });

    await expect(getMoodCentroids()).resolves.toEqual({
      happy: [{ index: 0, top_tags: ["pop"], n_songs: 12 }],
    });
  });

  // An older deployment answering with something else must not reach the picker
  // as a value it will try to enumerate.
  it("falls back to an empty catalogue on a body that isn't one", async () => {
    mockRequest.mockResolvedValue({ data: null });

    await expect(getMoodCentroids()).resolves.toEqual({});
  });
});
