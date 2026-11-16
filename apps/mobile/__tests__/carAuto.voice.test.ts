const mockSearchHits = jest.fn();
const mockPlayMediaId = jest.fn(async (..._args: unknown[]) => true);
const mockPlayCollection = jest.fn(async (..._args: unknown[]) => true);
const mockCollectionFor = jest.fn(async (..._args: unknown[]) => ({
  tracks: [],
}));
const mockStartTrackRadio = jest.fn(async (..._args: unknown[]) => true);
const mockPlay = jest.fn();
const mockMixTracks = jest.fn(async (..._args: unknown[]) => ({
  tracks: [{ id: "r" }],
}));
let mockCurrent: { id: string } | null = null;
let mockRecentPlays: { id: string; type: string; title: string }[] = [];

jest.mock("@/services/carAuto/providers/search", () => ({
  searchHits: (...args: unknown[]) => mockSearchHits(...args),
  matches: (value: string | undefined, query: string) =>
    (value ?? "").toLowerCase().includes(query.toLowerCase()),
}));
jest.mock("@/services/carAuto/play", () => ({
  playMediaId: (...args: unknown[]) => mockPlayMediaId(...args),
  playCollection: (...args: unknown[]) => mockPlayCollection(...args),
  collectionFor: (...args: unknown[]) => mockCollectionFor(...args),
}));
jest.mock("@/services/carAuto/providers/mixes", () => ({
  mixTracks: (...args: unknown[]) => mockMixTracks(...args),
}));
jest.mock("@/services/player", () => ({
  play: () => mockPlay(),
  startTrackRadio: (...args: unknown[]) => mockStartTrackRadio(...args),
}));
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => ({ getCurrent: () => mockCurrent }) },
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { getState: () => ({ recentPlays: mockRecentPlays }) },
}));
jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => child,
}));

import { playFromSearch } from "@/services/carAuto/voice";

const hits = (partial: Partial<Record<string, unknown[]>> = {}) => ({
  songs: [],
  albums: [],
  artists: [],
  playlists: [],
  ...partial,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrent = null;
  mockRecentPlays = [];
});

describe("play from search", () => {
  it("resumes what is loaded on an empty query", async () => {
    mockCurrent = { id: "t1" };

    await playFromSearch("");

    expect(mockPlay).toHaveBeenCalled();
    expect(mockSearchHits).not.toHaveBeenCalled();
  });

  it("plays the most recent collection when nothing is loaded", async () => {
    mockRecentPlays = [{ id: "al1", type: "album", title: "A" }];

    await playFromSearch("");

    expect(mockPlayMediaId).toHaveBeenCalledWith("album:al1");
  });

  it("shuffles the library when there is nothing to resume", async () => {
    await playFromSearch("");

    expect(mockMixTracks).toHaveBeenCalledWith("shuffleAll");
    expect(mockPlayCollection).toHaveBeenCalled();
  });

  it("prefers a playlist named exactly like the query", async () => {
    mockSearchHits.mockResolvedValue(
      hits({
        playlists: [{ id: "p1", name: "Road trip" }],
        songs: [{ id: "s1", title: "Road trip song" }],
      }),
    );

    await playFromSearch("road trip");

    expect(mockPlayMediaId).toHaveBeenCalledWith("playlist:p1");
  });

  it("starts radio from a song matching the title and artist hints", async () => {
    mockSearchHits.mockResolvedValue(
      hits({
        songs: [
          { id: "s1", title: "Water", artist: "Someone else" },
          { id: "s2", title: "Water", artist: "Bicep feat. Clara La San" },
        ],
      }),
    );

    await playFromSearch("water bicep", { title: "Water", artist: "Bicep" });

    expect(mockSearchHits).toHaveBeenCalledWith("Water");
    expect(mockStartTrackRadio).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s2" }),
    );
  });

  it("shuffles an artist asked for by name", async () => {
    mockSearchHits.mockResolvedValue(
      hits({ artists: [{ id: "ar1", name: "Bicep" }] }),
    );

    await playFromSearch("bicep");

    expect(mockPlayMediaId).toHaveBeenCalledWith("artist:ar1", {
      shuffle: true,
    });
  });

  it("plays the artist, not a self-titled album or song, on an artist-only request", async () => {
    mockSearchHits.mockResolvedValue(
      hits({
        albums: [{ id: "al1", name: "Metallica", artist: "Metallica" }],
        songs: [{ id: "s1", title: "Metallica", artist: "Metallica" }],
        artists: [{ id: "ar1", name: "Metallica" }],
      }),
    );

    await playFromSearch("Metallica", { artist: "Metallica" });

    expect(mockStartTrackRadio).not.toHaveBeenCalled();
    expect(mockPlayMediaId).toHaveBeenCalledTimes(1);
    expect(mockPlayMediaId).toHaveBeenCalledWith("artist:ar1", {
      shuffle: true,
    });
  });

  it("still plays a self-titled album asked for by album", async () => {
    mockSearchHits.mockResolvedValue(
      hits({
        albums: [{ id: "al1", name: "Metallica", artist: "Metallica" }],
        artists: [{ id: "ar1", name: "Metallica" }],
      }),
    );

    await playFromSearch("Metallica", {
      artist: "Metallica",
      album: "Metallica",
    });

    expect(mockPlayMediaId).toHaveBeenCalledWith("album:al1");
  });

  it("plays a genre mix for a genre-only request", async () => {
    await playFromSearch("some techno", { genre: "Techno" });

    expect(mockCollectionFor).toHaveBeenCalledWith({
      kind: "genre",
      name: "Techno",
    });
    expect(mockSearchHits).not.toHaveBeenCalled();
  });

  it("reports failure when nothing matches", async () => {
    mockSearchHits.mockResolvedValue(hits());

    expect(await playFromSearch("zzz")).toBe(false);
  });
});
