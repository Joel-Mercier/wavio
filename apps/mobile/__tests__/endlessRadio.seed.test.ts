// Endless playback falls back to the seed artist's top songs when similarity
// returns nothing. Which artist that is matters: `artistId` on a track is the
// *album* artist, so a compilation track would extend with the compilation's
// bucket instead of the artist actually playing.
const mockFetchSimilarSongs = jest.fn();
const mockFetchTopSongs = jest.fn();
let mockQueue: { id: string }[] = [];

jest.mock("@/services/similarSongs", () => ({
  fetchSimilarSongs: (...args: unknown[]) => mockFetchSimilarSongs(...args),
}));

jest.mock("@/services/topSongs", () => ({
  fetchTopSongs: (...args: unknown[]) => mockFetchTopSongs(...args),
}));

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => ({ queue: mockQueue }) },
}));

jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => child,
}));

import { fetchEndlessExtension } from "@/services/endlessRadio";
import type { QueueTrack } from "@/stores/queue";

const seed = (overrides: Partial<QueueTrack>) =>
  ({
    id: "t1",
    url: "http://x/t1",
    title: "Windowlicker",
    artist: "Aphex Twin",
    album: "Various Hits",
    ...overrides,
  }) as QueueTrack;

beforeEach(() => {
  mockFetchSimilarSongs.mockReset().mockResolvedValue([]);
  mockFetchTopSongs.mockReset().mockResolvedValue([]);
  mockQueue = [];
});

describe("fetchEndlessExtension", () => {
  it("seeds top songs from the track artist, not the album artist", async () => {
    await fetchEndlessExtension(
      seed({
        artistId: "va-compilation",
        artists: [{ id: "ar-aphex", name: "Aphex Twin" }],
      }),
    );

    expect(mockFetchTopSongs).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ar-aphex", name: "Aphex Twin" }),
    );
  });

  it("sends no id when only the album artist's is known", async () => {
    await fetchEndlessExtension(seed({ artistId: "va-compilation" }));

    expect(mockFetchTopSongs).toHaveBeenCalledWith(
      expect.objectContaining({ id: undefined, name: "Aphex Twin" }),
    );
  });

  it("does not fall back to top songs when similarity found songs", async () => {
    mockFetchSimilarSongs.mockResolvedValue([{ id: "s1" }]);

    await expect(
      fetchEndlessExtension(seed({ artistId: "ar-1" })),
    ).resolves.toEqual([{ id: "s1" }]);
    expect(mockFetchTopSongs).not.toHaveBeenCalled();
  });

  it("skips tracks already in the queue", async () => {
    mockQueue = [{ id: "s1" }];
    mockFetchSimilarSongs.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

    await expect(fetchEndlessExtension(seed({}))).resolves.toEqual([
      { id: "s2" },
    ]);
  });

  it("returns nothing when the seed has no artist at all", async () => {
    await expect(fetchEndlessExtension(seed({ artist: "" }))).resolves.toEqual(
      [],
    );
    expect(mockFetchTopSongs).not.toHaveBeenCalled();
  });
});
