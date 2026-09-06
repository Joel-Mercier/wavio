jest.mock("@/services/lastFm/client", () => ({
  callRead: jest.fn(),
  callSigned: jest.fn(),
}));
jest.mock("@/services/lastFm/config", () => ({
  hasLastFmCredentials: () => mockHasCredentials,
}));
jest.mock("@/stores/lastFm", () => ({
  isLastFmConnected: () => mockIsConnected,
}));
jest.mock("@/services/libraryContext", () => ({
  currentLibrarySearchContext: () => ({
    musicFolderId: "folder-1",
    multiFieldSearch: true,
  }),
}));
jest.mock("@/services/libraryMatch", () => ({
  matchTracksToLibrary: jest.fn(),
  // The real implementation; the resolver's whole point is that it normalises.
  normalizeLoose: jest.requireActual("@/services/musicbrainz/match")
    .normalizeLoose,
}));

let mockHasCredentials = true;
let mockIsConnected = true;

import { callRead } from "@/services/lastFm/client";
import {
  fetchLastFmSimilarSongs,
  pickLibrarySeeds,
  resolveSimilarArtists,
} from "@/services/lastFm/recommendations";
import {
  fetchSimilarArtists,
  fetchSimilarTracks,
} from "@/services/lastFm/similar";
import { matchTracksToLibrary } from "@/services/libraryMatch";
import type { ArtistID3 } from "@/services/openSubsonic/types";

const mockCallRead = callRead as jest.Mock;
const mockMatch = matchTracksToLibrary as jest.Mock;

const artist = (name: string, id: string, musicBrainzId?: string) =>
  ({ id, name, albumCount: 1, musicBrainzId }) as ArtistID3;

beforeEach(() => {
  mockCallRead.mockReset();
  mockMatch.mockReset();
  mockHasCredentials = true;
  mockIsConnected = true;
});

describe("fetchSimilarTracks", () => {
  it("sends the name pair with autocorrect", async () => {
    mockCallRead.mockResolvedValue({ similartracks: { track: [] } });

    await fetchSimilarTracks({
      artist: "Pearl Jam",
      track: "Alive",
      limit: 20,
    });

    expect(mockCallRead).toHaveBeenCalledWith(
      "track.getSimilar",
      { artist: "Pearl Jam", track: "Alive", limit: 20, autocorrect: 1 },
      { signal: undefined },
    );
  });

  it("prefers the mbid and then omits the names entirely", async () => {
    mockCallRead.mockResolvedValue({ similartracks: { track: [] } });

    await fetchSimilarTracks({
      artist: "Pearl Jam",
      track: "Alive",
      mbid: "rec-1",
      limit: 20,
    });

    expect(mockCallRead).toHaveBeenCalledWith(
      "track.getSimilar",
      { mbid: "rec-1", limit: 20, autocorrect: 1 },
      { signal: undefined },
    );
  });

  it("does not make a request it can only fail", async () => {
    expect(
      await fetchSimilarTracks({ artist: "Pearl Jam", limit: 20 }),
    ).toEqual([]);
    expect(mockCallRead).not.toHaveBeenCalled();
  });

  it("reads duration as seconds and turns it into milliseconds", async () => {
    mockCallRead.mockResolvedValue({
      similartracks: {
        track: [
          {
            name: "Black",
            artist: { name: "Pearl Jam" },
            duration: "343",
            match: "0.91",
            mbid: "rec-2",
          },
          { name: "Jeremy", artist: { name: "Pearl Jam" }, duration: 0 },
        ],
      },
    });

    const tracks = await fetchSimilarTracks({
      artist: "Pearl Jam",
      track: "Alive",
      limit: 20,
    });

    expect(tracks[0]).toEqual({
      name: "Black",
      artist: "Pearl Jam",
      mbid: "rec-2",
      durationMs: 343000,
      match: 0.91,
    });
    expect(tracks[1].durationMs).toBeUndefined();
  });
});

describe("fetchSimilarArtists", () => {
  it("maps names and matches", async () => {
    mockCallRead.mockResolvedValue({
      similarartists: {
        artist: [
          { name: "Soundgarden", mbid: "a-1", match: "0.99" },
          { name: "Alice In Chains", match: 0.9 },
          { name: "   " },
        ],
      },
    });

    expect(
      await fetchSimilarArtists({ artist: "Pearl Jam", limit: 60 }),
    ).toEqual([
      { name: "Soundgarden", mbid: "a-1", match: 0.99 },
      { name: "Alice In Chains", mbid: undefined, match: 0.9 },
    ]);
  });
});

describe("fetchLastFmSimilarSongs", () => {
  const seed = { title: "Alive", artist: "Pearl Jam" };

  it("returns nothing without a connected account", async () => {
    mockIsConnected = false;

    expect(await fetchLastFmSimilarSongs(seed)).toEqual([]);
    expect(mockCallRead).not.toHaveBeenCalled();
  });

  it("returns nothing when the build has no API credentials", async () => {
    mockHasCredentials = false;

    expect(await fetchLastFmSimilarSongs(seed)).toEqual([]);
    expect(mockCallRead).not.toHaveBeenCalled();
  });

  it("returns nothing for a seed it cannot name", async () => {
    expect(await fetchLastFmSimilarSongs({ title: "Alive" })).toEqual([]);
    expect(await fetchLastFmSimilarSongs(undefined)).toEqual([]);
    expect(mockCallRead).not.toHaveBeenCalled();
  });

  it("resolves Last.fm's list against the library, keeping its order", async () => {
    mockCallRead.mockResolvedValue({
      similartracks: {
        track: [
          { name: "Black", artist: { name: "Pearl Jam" }, match: "0.9" },
          { name: "Rusty Cage", artist: { name: "Soundgarden" }, match: "0.8" },
        ],
      },
    });
    mockMatch.mockResolvedValue([
      { state: "matched", external: { key: "0" }, track: { id: "song-1" } },
      { state: "missing", external: { key: "1" } },
    ]);

    const songs = await fetchLastFmSimilarSongs(seed, { count: 5 });

    expect(songs).toEqual([{ id: "song-1" }]);
    expect(mockMatch).toHaveBeenCalledWith(
      [
        {
          key: "0",
          title: "Black",
          artist: "Pearl Jam",
          durationMs: undefined,
          recordingMbid: undefined,
        },
        {
          key: "1",
          title: "Rusty Cage",
          artist: "Soundgarden",
          durationMs: undefined,
          recordingMbid: undefined,
        },
      ],
      expect.objectContaining({
        musicFolderId: "folder-1",
        multiFieldSearch: true,
      }),
    );
  });

  it("asks for more candidates than it needs, capped", async () => {
    mockCallRead.mockResolvedValue({ similartracks: { track: [] } });

    await fetchLastFmSimilarSongs(seed, { count: 5 });
    expect(mockCallRead.mock.calls[0][1].limit).toBe(20);

    mockCallRead.mockClear();
    await fetchLastFmSimilarSongs(seed, { count: 50 });
    expect(mockCallRead.mock.calls[0][1].limit).toBe(60);
  });

  it("does not search the library when Last.fm returned nothing", async () => {
    mockCallRead.mockResolvedValue({ similartracks: { track: [] } });

    expect(await fetchLastFmSimilarSongs(seed)).toEqual([]);
    expect(mockMatch).not.toHaveBeenCalled();
  });

  it("trims to the requested count", async () => {
    mockCallRead.mockResolvedValue({
      similartracks: {
        track: [
          { name: "a", artist: { name: "x" } },
          { name: "b", artist: { name: "x" } },
          { name: "c", artist: { name: "x" } },
        ],
      },
    });
    mockMatch.mockResolvedValue([
      { state: "matched", external: { key: "0" }, track: { id: "1" } },
      { state: "matched", external: { key: "1" }, track: { id: "2" } },
      { state: "matched", external: { key: "2" }, track: { id: "3" } },
    ]);

    expect(await fetchLastFmSimilarSongs(seed, { count: 2 })).toEqual([
      { id: "1" },
      { id: "2" },
    ]);
  });
});

describe("resolveSimilarArtists", () => {
  const library = [
    artist("Beatles", "lib-beatles"),
    artist("Soundgarden", "lib-sg", "MBID-SG"),
    artist("Alice in Chains", "lib-aic"),
  ];

  it("matches on the normalised name, ignoring a leading article", () => {
    expect(
      resolveSimilarArtists([{ name: "The Beatles", match: 1 }], library, 10),
    ).toEqual([library[0]]);
  });

  it("matches on the mbid regardless of the name", () => {
    expect(
      resolveSimilarArtists(
        [{ name: "Sound Garden", mbid: "mbid-sg", match: 1 }],
        library,
        10,
      ),
    ).toEqual([library[1]]);
  });

  it("keeps Last.fm's order and drops artists the library doesn't have", () => {
    const picked = resolveSimilarArtists(
      [
        { name: "Nirvana", match: 0.99 },
        { name: "Alice in Chains", match: 0.9 },
        { name: "Soundgarden", match: 0.8 },
      ],
      library,
      10,
    );

    expect(picked.map((a) => a.id)).toEqual(["lib-aic", "lib-sg"]);
  });

  it("never returns the same library artist twice", () => {
    const picked = resolveSimilarArtists(
      [
        { name: "The Beatles", match: 1 },
        { name: "Beatles", match: 0.9 },
      ],
      library,
      10,
    );

    expect(picked).toHaveLength(1);
  });

  it("stops at the limit", () => {
    const picked = resolveSimilarArtists(
      [
        { name: "Beatles", match: 1 },
        { name: "Soundgarden", match: 0.9 },
        { name: "Alice in Chains", match: 0.8 },
      ],
      library,
      2,
    );

    expect(picked).toHaveLength(2);
  });
});

describe("pickLibrarySeeds", () => {
  const library = [
    artist("Beatles", "lib-beatles"),
    artist("Soundgarden", "lib-sg", "MBID-SG"),
    artist("Alice in Chains", "lib-aic"),
  ];

  it("keeps only the names the library has, in the caller's order", () => {
    expect(
      pickLibrarySeeds(
        [
          { name: "Michael Jackson" },
          { name: "Alice in Chains" },
          { name: "Nirvana" },
          { name: "The Beatles" },
        ],
        library,
        5,
      ),
    ).toEqual(["Alice in Chains", "The Beatles"]);
  });

  it("returns Last.fm's spelling, not the library's", () => {
    // The seed goes straight back out to artist.getSimilar, so it has to be a
    // name Last.fm knows — the library's tag is only what matched it.
    expect(pickLibrarySeeds([{ name: "The Beatles" }], library, 5)).toEqual([
      "The Beatles",
    ]);
  });

  it("matches on the mbid regardless of the name", () => {
    expect(
      pickLibrarySeeds([{ name: "Sound Garden", mbid: "mbid-sg" }], library, 5),
    ).toEqual(["Sound Garden"]);
  });

  it("never seeds on the same library artist twice", () => {
    expect(
      pickLibrarySeeds(
        [{ name: "The Beatles" }, { name: "Beatles" }],
        library,
        5,
      ),
    ).toEqual(["The Beatles"]);
  });

  it("stops at the limit", () => {
    expect(
      pickLibrarySeeds(
        [
          { name: "Beatles" },
          { name: "Soundgarden" },
          { name: "Alice in Chains" },
        ],
        library,
        2,
      ),
    ).toHaveLength(2);
  });

  it("returns nothing when the library shares no artist with the list", () => {
    expect(pickLibrarySeeds([{ name: "Michael Jackson" }], library, 5)).toEqual(
      [],
    );
  });
});
