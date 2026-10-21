const mockGetArtistInfo2 = jest.fn();
const mockGetArtist = jest.fn();
const mockGetAlbum = jest.fn();
const mockGetArtists = jest.fn();
const mockGetArtistsByIds = jest.fn();
const mockQueryCache = new Map<string, unknown>();
const mockGetRandomSongs = jest.fn();
const mockFetchTopSongs = jest.fn();
const mockFindSimilarArtists = jest.fn();
const mockFetchLastFmSimilarArtists = jest.fn();
let mockCapabilities = { extendedMetadata: true, songLists: true };
let mockAudioMuseAvailable = false;
let mockLastFmConnected = false;

jest.mock("@/config/queryClient", () => ({
  queryClient: {
    ensureQueryData: ({ queryFn }: { queryFn: () => unknown }) => queryFn(),
    fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn(),
    getQueryData: (key: unknown[]) => mockQueryCache.get(JSON.stringify(key)),
  },
}));

jest.mock("@/services/backend/browsing", () => ({
  getArtistInfo2: (...args: unknown[]) => mockGetArtistInfo2(...args),
  getArtist: (...args: unknown[]) => mockGetArtist(...args),
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
  getArtists: (...args: unknown[]) => mockGetArtists(...args),
  getArtistsByIds: (...args: unknown[]) => mockGetArtistsByIds(...args),
}));

jest.mock("@/services/backend/lists", () => ({
  getRandomSongs: (...args: unknown[]) => mockGetRandomSongs(...args),
}));

jest.mock("@/services/topSongs", () => ({
  fetchTopSongs: (...args: unknown[]) => mockFetchTopSongs(...args),
}));

jest.mock("@/services/audioMuse/artists", () => ({
  ...jest.requireActual("@/services/audioMuse/artists"),
  findSimilarArtists: (...args: unknown[]) => mockFindSimilarArtists(...args),
}));

jest.mock("@/stores/audioMuse", () => ({
  useAudioMuseBase: { getState: () => ({}) },
  selectSimilarArtistsAvailable: () => mockAudioMuseAvailable,
}));

jest.mock("@/services/lastFm/similar", () => ({
  fetchSimilarArtists: (...args: unknown[]) =>
    mockFetchLastFmSimilarArtists(...args),
}));

jest.mock("@/services/lastFm/recommendations", () => ({
  canUseLastFmRecommendations: () => mockLastFmConnected,
  resolveSimilarArtists: (
    similar: { name: string }[],
    library: { id: string; name: string }[],
    limit: number,
  ) =>
    similar
      .flatMap((s) => library.filter((a) => a.name === s.name))
      .slice(0, limit),
}));

jest.mock("@/services/libraryContext", () => ({
  currentLibraryCapabilities: () => mockCapabilities,
}));

import {
  ARTIST_SCREEN_SIMILAR_PARAMS,
  generateArtistMix,
  resolveMixArtists,
} from "@/services/mixes/artistMix";
import type { Child } from "@/services/openSubsonic/types";
import { AbortedError } from "@/utils/rateLimitedQueue";
import { mulberry32 } from "@/utils/shuffle";

const seed = { id: "ar-seed", name: "ar-seed" };

let nextId = 0;
const songsBy = (artistId: string, count: number, genre = "Rock"): Child[] =>
  Array.from(
    { length: count },
    () =>
      ({
        id: `${artistId}-t${nextId++}`,
        title: `Song ${nextId}`,
        artist: artistId,
        artists: [{ id: artistId, name: artistId }],
        albumId: `${artistId}-al${nextId % 3}`,
        duration: 200,
        genre,
        isDir: false,
      }) as Child,
  );

beforeEach(() => {
  nextId = 0;
  mockCapabilities = { extendedMetadata: true, songLists: true };
  mockAudioMuseAvailable = false;
  mockLastFmConnected = false;
  mockGetArtistInfo2.mockReset().mockResolvedValue({ artistInfo2: {} });
  mockFindSimilarArtists.mockReset().mockResolvedValue([]);
  mockFetchLastFmSimilarArtists.mockReset().mockResolvedValue([]);
  mockGetArtists.mockReset().mockResolvedValue({ artists: { index: [] } });
  mockQueryCache.clear();
  mockGetArtistsByIds
    .mockReset()
    .mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id, name: id })),
    );
  mockGetRandomSongs.mockReset().mockResolvedValue({ songs: {} });
  mockFetchTopSongs
    .mockReset()
    .mockImplementation(async ({ id }: { id: string }) => songsBy(id, 10));
  mockGetArtist.mockReset().mockImplementation(async (id: string) => ({
    artist: { id, album: [{ id: `${id}-album` }] },
  }));
  mockGetAlbum.mockReset().mockResolvedValue({ album: { song: [] } });
});

describe("resolveMixArtists", () => {
  it("uses the server's similar artists and skips the third parties", async () => {
    mockAudioMuseAvailable = true;
    mockLastFmConnected = true;
    mockGetArtistInfo2.mockResolvedValue({
      artistInfo2: {
        similarArtist: Array.from({ length: 8 }, (_, i) => ({
          id: `ar-${i}`,
          name: `Artist ${i}`,
        })),
      },
    });
    const artists = await resolveMixArtists(seed, {});
    expect(artists).toHaveLength(8);
    expect(mockFindSimilarArtists).not.toHaveBeenCalled();
    expect(mockFetchLastFmSimilarArtists).not.toHaveBeenCalled();
  });

  it("falls through to AudioMuse, then Last.fm, deduping across tiers", async () => {
    mockAudioMuseAvailable = true;
    mockLastFmConnected = true;
    mockGetArtistInfo2.mockRejectedValue(new Error("boom"));
    mockFindSimilarArtists.mockResolvedValue([
      { artist: "One", artist_id: "ar-1" },
      { artist: "Unmapped", artist_id: null },
    ]);
    mockFetchLastFmSimilarArtists.mockResolvedValue([
      { name: "One", match: 1 },
      { name: "Two", match: 0.9 },
      { name: "Seed", match: 0.8 },
    ]);
    mockGetArtists.mockResolvedValue({
      artists: {
        index: [
          {
            artist: [
              { id: "ar-1", name: "One" },
              { id: "ar-2", name: "Two" },
              { id: "ar-seed", name: "Seed" },
            ],
          },
        ],
      },
    });
    const artists = await resolveMixArtists(seed, {});
    expect(artists.map((a) => a.id)).toEqual(["ar-1", "ar-2"]);
  });

  it("drops AudioMuse ids the backend doesn't know", async () => {
    mockAudioMuseAvailable = true;
    mockCapabilities = { extendedMetadata: false, songLists: true };
    mockFindSimilarArtists.mockResolvedValue([
      { artist: "One", artist_id: "ar-1" },
      { artist: "Ghost", artist_id: "ar-ghost" },
    ]);
    mockGetArtistsByIds.mockResolvedValue([{ id: "ar-1", name: "One" }]);
    const artists = await resolveMixArtists(seed, {});
    expect(artists.map((a) => a.id)).toEqual(["ar-1"]);
  });

  it("recovers null-id AudioMuse rows by name from the cached index", async () => {
    mockAudioMuseAvailable = true;
    mockCapabilities = { extendedMetadata: false, songLists: true };
    mockFindSimilarArtists.mockResolvedValue([
      { artist: "one", artist_id: null },
      { artist: "Two", artist_id: "ar-2" },
    ]);
    mockQueryCache.set(JSON.stringify(["artists", {}]), {
      artists: {
        index: [
          {
            artist: [
              { id: "ar-1", name: "One" },
              { id: "ar-2", name: "Two" },
            ],
          },
        ],
      },
    });
    const artists = await resolveMixArtists(seed, {});
    expect(artists.map((a) => a.id)).toEqual(["ar-1", "ar-2"]);
    expect(mockGetArtistsByIds).not.toHaveBeenCalled();
  });

  it("retries Last.fm by name when the mbid finds nothing", async () => {
    mockLastFmConnected = true;
    mockCapabilities = { extendedMetadata: false, songLists: true };
    mockFetchLastFmSimilarArtists.mockImplementation(
      async ({ mbid }: { mbid?: string }) => {
        if (mbid) throw new Error("artist not found");
        return [{ name: "One", match: 1 }];
      },
    );
    mockGetArtists.mockResolvedValue({
      artists: { index: [{ artist: [{ id: "ar-1", name: "One" }] }] },
    });
    const artists = await resolveMixArtists(
      { ...seed, musicBrainzId: "stale-mbid" },
      {},
    );
    expect(artists.map((a) => a.id)).toEqual(["ar-1"]);
    expect(mockFetchLastFmSimilarArtists).toHaveBeenLastCalledWith(
      expect.objectContaining({ mbid: undefined, artist: "ar-seed" }),
    );
  });

  it("reuses the artist screen's similar artists when enough are in the library", async () => {
    mockQueryCache.set(
      JSON.stringify(["artistInfo2", seed.id, ARTIST_SCREEN_SIMILAR_PARAMS]),
      {
        artistInfo2: {
          similarArtist: [
            ...Array.from({ length: 6 }, (_, i) => ({
              id: `ar-${i}`,
              name: `Artist ${i}`,
            })),
            { id: "", name: "Not in library" },
            { id: "-1", name: "Not in library either" },
          ],
        },
      },
    );
    const artists = await resolveMixArtists(seed, {});
    expect(artists).toHaveLength(6);
    expect(mockGetArtistInfo2).not.toHaveBeenCalled();
  });

  it("asks the server itself when the screen's answer is mostly outside the library", async () => {
    mockQueryCache.set(
      JSON.stringify(["artistInfo2", seed.id, ARTIST_SCREEN_SIMILAR_PARAMS]),
      {
        artistInfo2: {
          similarArtist: [
            { id: "ar-0", name: "Artist 0" },
            { id: "", name: "Not in library" },
          ],
        },
      },
    );
    await resolveMixArtists(seed, {});
    expect(mockGetArtistInfo2).toHaveBeenCalledWith(
      seed.id,
      expect.objectContaining({ includeNotPresent: false }),
    );
  });

  it("never asks the server on a backend without artist info", async () => {
    mockCapabilities = { extendedMetadata: false, songLists: true };
    await resolveMixArtists(seed, {});
    expect(mockGetArtistInfo2).not.toHaveBeenCalled();
  });
});

describe("generateArtistMix", () => {
  it("mixes the seed with similar artists within their caps", async () => {
    mockGetArtistInfo2.mockResolvedValue({
      artistInfo2: {
        similarArtist: Array.from({ length: 12 }, (_, i) => ({
          id: `ar-${i}`,
          name: `Artist ${i}`,
        })),
      },
    });
    const mix = await generateArtistMix(seed, { rand: mulberry32(1) });
    expect(mix.tracks.length).toBeGreaterThan(40);
    expect(mockGetRandomSongs).not.toHaveBeenCalled();
    const seedCount = mix.tracks.filter(
      (t) => t.artists?.[0]?.id === "ar-seed",
    ).length;
    expect(seedCount).toBeLessThanOrEqual(10);
    expect(seedCount).toBeGreaterThan(0);
    expect(mix.featuredArtists[0]).toBe("Artist 0");
    expect(mix.featuredArtists).not.toContain("ar-seed");
  });

  it("survives one similar artist failing", async () => {
    mockGetArtistInfo2.mockResolvedValue({
      artistInfo2: {
        similarArtist: [
          { id: "ar-bad", name: "ar-bad" },
          { id: "ar-good", name: "ar-good" },
        ],
      },
    });
    mockFetchTopSongs.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "ar-bad") throw new Error("boom");
      return songsBy(id, 10);
    });
    mockGetArtist.mockImplementation(async (id: string) => {
      if (id === "ar-bad") throw new Error("boom");
      return { artist: { id, album: [] } };
    });
    const mix = await generateArtistMix(seed, { rand: mulberry32(1) });
    expect(mix.tracks.some((t) => t.artists?.[0]?.id === "ar-good")).toBe(true);
    expect(mix.featuredArtists).toEqual(["ar-good"]);
  });

  it("falls back to the seed's genres when nobody is similar", async () => {
    mockCapabilities = { extendedMetadata: false, songLists: true };
    mockGetRandomSongs.mockImplementation(async () => ({
      songs: {
        song: ["ar-x", "ar-y", "ar-z"].flatMap((id) => songsBy(id, 5, "Rock")),
      },
    }));
    const mix = await generateArtistMix(seed, { rand: mulberry32(1) });
    expect(mockGetRandomSongs).toHaveBeenCalledWith(
      expect.objectContaining({ genre: "Rock" }),
    );
    const artists = new Set(mix.tracks.map((t) => t.artists?.[0]?.id));
    expect(artists.has("ar-seed")).toBe(true);
    expect(artists.has("ar-x")).toBe(true);
  });

  it("never plays the seed back to back when the genre top-up is empty", async () => {
    mockCapabilities = { extendedMetadata: false, songLists: true };
    mockGetRandomSongs.mockResolvedValue({
      songs: { song: songsBy("ar-x", 6) },
    });
    const mix = await generateArtistMix(seed, { rand: mulberry32(1) });
    const keys = mix.tracks.map((t) => t.artists?.[0]?.id);
    expect(keys.filter((k) => k === "ar-seed").length).toBeLessThanOrEqual(1);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] === "ar-seed" && keys[i - 1] === "ar-seed").toBe(false);
    }
  });

  it("stops issuing requests once cancelled", async () => {
    const controller = new AbortController();
    mockGetArtistInfo2.mockImplementation(async () => {
      controller.abort();
      return {
        artistInfo2: { similarArtist: [{ id: "ar-1", name: "Artist 1" }] },
      };
    });
    await expect(
      generateArtistMix(seed, {
        rand: mulberry32(1),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(mockFetchTopSongs).not.toHaveBeenCalled();
    expect(mockGetArtist).not.toHaveBeenCalled();
    expect(mockGetRandomSongs).not.toHaveBeenCalled();
  });

  it("keeps the seed out of the subtitle when its tracks spell it differently", async () => {
    mockCapabilities = { extendedMetadata: false, songLists: true };
    const credited = (artist: string, count: number) =>
      songsBy(artist, count).map((t) => ({ ...t, artists: undefined }));
    mockFetchTopSongs.mockImplementation(async ({ id }: { id: string }) =>
      id === "ar-seed" ? credited("Beyonce", 10) : [],
    );
    mockGetRandomSongs.mockResolvedValue({
      songs: { song: ["X", "Y", "Z"].flatMap((a) => credited(a, 5)) },
    });
    const mix = await generateArtistMix(
      { id: "ar-seed", name: "Beyoncé" },
      { rand: mulberry32(1) },
    );
    expect(mix.tracks.some((t) => t.artist === "Beyonce")).toBe(true);
    expect(mix.featuredArtists).not.toContain("Beyonce");
    expect(mix.featuredArtists.length).toBeGreaterThan(0);
  });
});
