// The path endpoint takes three different shapes of endpoint across two query
// parameter families, and its two options are tri-state on the wire: omitting
// one hands the deployment's own default back, so a toggle that doesn't reach
// the query string silently does nothing. Its 404s are also the opposite of the
// similarity endpoints' — they carry a reason the user can act on, so they must
// reach the screen instead of flattening to an empty list.
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

import { audioMuseErrorMessage } from "@/services/audioMuse";
import { listAnchors } from "@/services/audioMuse/anchors";
import {
  clampMoodPct,
  clampPathLength,
  findSongPath,
  isResolvedEndpoint,
  PATH_DEFAULT_LENGTH,
  PATH_DEFAULT_MOOD_PCT,
  PATH_MAX_LENGTH,
  PATH_MAX_MOOD_PCT,
  PATH_MIN_LENGTH,
  PATH_MIN_MOOD_PCT,
  type PathEndpoint,
  searchPathTracks,
} from "@/services/audioMuse/path";
import {
  selectLyricsPathAvailable,
  selectSongPathAvailable,
  useAudioMuseBase,
} from "@/stores/audioMuse";

const lastRequest = () => mockRequest.mock.calls.at(-1)?.[0];

const httpError = (status: number, data: unknown = {}) => {
  const error = new Error(
    `Request failed with status code ${status}`,
  ) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: unknown };
  };
  error.isAxiosError = true;
  error.response = { status, data };
  return error;
};

const song = (itemId: string): PathEndpoint => ({ kind: "song", itemId });

const path = (overrides: Record<string, unknown> = {}) =>
  findSongPath({
    start: song("a"),
    end: song("b"),
    length: 25,
    fixSize: false,
    lyrics: false,
    moodPct: 100,
    ...overrides,
  });

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ data: { path: [], total_distance: 0 } });
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("clampPathLength", () => {
  it("holds the length inside what the endpoint accepts", () => {
    expect(clampPathLength(1)).toBe(PATH_MIN_LENGTH);
    expect(clampPathLength(5000)).toBe(PATH_MAX_LENGTH);
    expect(clampPathLength(12.4)).toBe(12);
  });

  // The field can be emptied while typing, which reaches here as NaN.
  it("falls back to the default when the field holds no number", () => {
    expect(clampPathLength(Number.NaN)).toBe(PATH_DEFAULT_LENGTH);
  });
});

describe("clampMoodPct", () => {
  it("holds the blend inside the range the endpoint interpolates over", () => {
    expect(clampMoodPct(0)).toBe(PATH_MIN_MOOD_PCT);
    expect(clampMoodPct(500)).toBe(PATH_MAX_MOOD_PCT);
    expect(clampMoodPct(Number.NaN)).toBe(PATH_DEFAULT_MOOD_PCT);
  });
});

describe("isResolvedEndpoint", () => {
  it("counts only the endpoints AudioMuse has to resolve to a track", () => {
    expect(isResolvedEndpoint(song("a"))).toBe(false);
    expect(isResolvedEndpoint({ kind: "mood", mood: "happy" })).toBe(true);
    expect(isResolvedEndpoint({ kind: "anchor", id: 3, name: "x" })).toBe(true);
    expect(isResolvedEndpoint(null)).toBe(false);
  });
});

describe("findSongPath", () => {
  it("serialises each endpoint into its own parameter family", async () => {
    await path({
      start: { kind: "mood", mood: "relaxed" },
      end: song("b"),
    });

    expect(lastRequest()).toMatchObject({
      url: "/api/find_path",
      params: { start_mood: "relaxed", end_song_id: "b" },
    });
    expect(lastRequest()?.params?.start_song_id).toBeUndefined();
  });

  it("sends an anchor as its id", async () => {
    await path({ end: { kind: "anchor", id: 7, name: "Late night" } });

    expect(lastRequest()?.params?.end_anchor).toBe("7");
  });

  it("sends both options explicitly rather than letting the server default", async () => {
    await path({ fixSize: true, lyrics: true });

    expect(lastRequest()?.params).toMatchObject({
      path_fix_size: "true",
      path_space: "lyrics",
      max_steps: 25,
      mood_pct: 100,
    });
  });

  it("names the audio space when the lyrics option is off", async () => {
    await path();

    expect(lastRequest()?.params?.path_space).toBe("audio");
  });

  it("clamps the requested length before it reaches the wire", async () => {
    await path({ length: 9999 });

    expect(lastRequest()?.params?.max_steps).toBe(PATH_MAX_LENGTH);
  });

  // GET calls carry the media-server selection as a query param; without it
  // AudioMuse answers with ids from whichever library it defaults to.
  it("scopes the path to the selected media server", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");

    await path();

    expect(lastRequest()?.params?.server).toBe("srv-2");
  });

  it("returns the path in order, dropping rows without an id", async () => {
    mockRequest.mockResolvedValue({
      data: {
        path: [{ item_id: "a" }, { item_id: "" }, { item_id: "b" }],
        total_distance: 1.5,
      },
    });

    await expect(path()).resolves.toEqual([{ item_id: "a" }, { item_id: "b" }]);
  });

  // Unlike the similarity endpoints, a 404 here is a refusal with a reason —
  // swallowing it would show an empty list where the user needs to be told the
  // lyrics index isn't built.
  it("raises a 404 so its reason can be relayed", async () => {
    const error = httpError(404, {
      error: "The Lyrics (SemGrove) index is not loaded yet.",
    });
    mockRequest.mockRejectedValue(error);

    await expect(path({ lyrics: true })).rejects.toThrow();
    expect(audioMuseErrorMessage(error)).toBe(
      "The Lyrics (SemGrove) index is not loaded yet.",
    );
  });
});

describe("searchPathTracks", () => {
  it("searches the audio catalogue by default", async () => {
    mockRequest.mockResolvedValue({ data: [] });

    await searchPathTracks("blue");

    expect(lastRequest()).toMatchObject({
      url: "/api/search_tracks",
      params: { search_query: "blue", start: 0, index: "musicnn" },
    });
  });

  // Picking a track the lyrics index doesn't hold would make the path refuse,
  // so the picker narrows the catalogue instead.
  it("narrows to the lyrics index when the path follows the lyrics", async () => {
    mockRequest.mockResolvedValue({ data: [] });

    await searchPathTracks("blue", { lyrics: true });

    expect(lastRequest()?.params?.index).toBe("sem_grove");
  });

  it("never asks for an empty query", async () => {
    await expect(searchPathTracks("   ")).resolves.toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("drops rows without an id", async () => {
    mockRequest.mockResolvedValue({
      data: [{ item_id: "a", title: "A" }, { item_id: "" }],
    });

    await expect(searchPathTracks("a")).resolves.toEqual([
      { item_id: "a", title: "A" },
    ]);
  });
});

describe("listAnchors", () => {
  // Anchors are raw vectors held once per deployment, not per media server.
  it("asks deployment-wide, without a server scope", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");
    mockRequest.mockResolvedValue({ data: { anchors: [] } });

    await listAnchors();

    expect(lastRequest()?.url).toBe("/api/anchors");
    expect(lastRequest()?.params?.server).toBeUndefined();
  });

  // A database failure answers 500 with an empty list beside the error, which is
  // the same outcome for the picker as having no anchors at all.
  it("reads a body without anchors as none", async () => {
    mockRequest.mockResolvedValue({
      data: { anchors: [], error: "Unable to retrieve anchors at this time." },
    });

    await expect(listAnchors()).resolves.toEqual([]);
  });

  it("keeps only anchors carrying an id", async () => {
    mockRequest.mockResolvedValue({
      data: { anchors: [{ id: 1, name: "A" }, { name: "B" }] },
    });

    await expect(listAnchors()).resolves.toEqual([{ id: 1, name: "A" }]);
  });
});

describe("selectSongPathAvailable", () => {
  it("needs a connection", () => {
    expect(
      selectSongPathAvailable({ isConnected: false, analyzedTrackCount: 500 }),
    ).toBe(false);
  });

  it("hides the feature only when the analysis is provably empty", () => {
    expect(
      selectSongPathAvailable({ isConnected: true, analyzedTrackCount: 0 }),
    ).toBe(false);
    // Null is "the deployment didn't say", which is not a reason to hide it.
    expect(
      selectSongPathAvailable({ isConnected: true, analyzedTrackCount: null }),
    ).toBe(true);
  });
});

describe("selectLyricsPathAvailable", () => {
  // The lyrics space walks a second index the operator has to build; without it
  // the endpoint refuses outright, so the option is withheld rather than failing.
  it("needs the merged lyrics index on top of the path itself", () => {
    expect(
      selectLyricsPathAvailable({
        isConnected: true,
        analyzedTrackCount: 500,
        semGroveEnabled: false,
      }),
    ).toBe(false);
    expect(
      selectLyricsPathAvailable({
        isConnected: true,
        analyzedTrackCount: 500,
        semGroveEnabled: true,
      }),
    ).toBe(true);
  });
});
