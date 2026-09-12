// A real `artist.jpg` (services/local/folderArt.ts) has to reach *every* place
// an artist is drawn, not just the artist list. Both paths below used to read an
// album cover instead — `getArtist` off the first album row, search off the
// matching track's artwork — so an artist with a portrait showed one of their
// sleeves on the two screens where the portrait is the whole point.
//
// Mocked at the repository seam rather than run against SQLite: the SQL that
// resolves `artist_art` is already exercised where it lives (queryArtists), and
// what regressed here was the wiring above it.
jest.mock("@/services/local/repository", () => ({
  queryArtistAlbumsByKey: jest.fn(),
  queryArtistByKey: jest.fn(),
  queryArtistArtByKeys: jest.fn(),
  queryAlbumByKey: jest.fn(),
  queryAlbumTracksByKey: jest.fn(),
  queryAllSongsByArtist: jest.fn(),
  queryArtists: jest.fn(),
  queryExistingTrackIds: jest.fn(),
  queryGenres: jest.fn(),
  searchTracks: jest.fn(),
}));
jest.mock("@/services/local/paths", () => ({
  folderLabel: (value: string) => value,
  localFolders: () => [],
}));
// The "Unknown artist" fallbacks localize through the i18n instance; stub it so
// this doesn't pull the i18n/zod ESM graph jest can't transform.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
// The envelope reads the server version off the auth store, which pulls MMKV in.
jest.mock("@/services/local/unsupported", () => ({
  localEnvelope: <T>(payload: T) => payload,
  LocalUnsupportedError: class extends Error {},
}));
// mapRowToChild reads star/rating state out of MMKV-backed storage.
jest.mock("@/stores/localLibrary", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      favoriteTracks: {},
      favoriteAlbums: {},
      favoriteArtists: {},
      ratings: {},
    }),
  },
}));

import { getArtist } from "@/services/local/browsing";
import { localArtistId } from "@/services/local/keys";
import {
  queryArtistAlbumsByKey,
  queryArtistArtByKeys,
  queryArtistByKey,
  searchTracks,
} from "@/services/local/repository";
import { search3 } from "@/services/local/searching";

const mockAlbums = queryArtistAlbumsByKey as jest.Mock;
const mockArtist = queryArtistByKey as jest.Mock;
const mockArtistArt = queryArtistArtByKeys as jest.Mock;
const mockSearch = searchTracks as jest.Mock;

const albumRow = {
  album_key: "alpha album",
  name: "Alpha Album",
  artist_key: "alpha",
  album_artist: "Alpha",
  artist: "Alpha",
  cover: "file:///art/album-cover.jpg",
  song_count: 1,
  duration: 0,
  year: null,
  created: 0,
};

const trackRow = {
  id: "t1",
  album_key: "alpha album",
  album: "Alpha Album",
  artist_key: "alpha",
  album_artist: "Alpha",
  artist: "Alpha",
  artwork_path: "file:///art/album-cover.jpg",
  indexed_at: 0,
  year: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getArtist", () => {
  it("prefers the artist's own image over the first album's cover", async () => {
    mockAlbums.mockResolvedValue([albumRow]);
    mockArtist.mockResolvedValue({
      artist_key: "alpha",
      name: "Alpha",
      album_count: 1,
      cover: "file:///art/artist-portrait.jpg",
    });

    const { artist } = await getArtist(localArtistId("alpha"));

    expect(artist?.coverArt).toBe("file:///art/artist-portrait.jpg");
  });

  // The aggregate row already falls back to an album cover itself, so this only
  // covers it going missing entirely — the artist list would render nothing
  // there, and this screen shouldn't start doing the same.
  it("falls back to the first album's cover when there is no aggregate row", async () => {
    mockAlbums.mockResolvedValue([albumRow]);
    mockArtist.mockResolvedValue(null);

    const { artist } = await getArtist(localArtistId("alpha"));

    expect(artist?.coverArt).toBe("file:///art/album-cover.jpg");
  });
});

describe("search3", () => {
  it("upgrades a matched artist's cover to their own image", async () => {
    mockSearch.mockResolvedValue([trackRow]);
    mockArtistArt.mockResolvedValue(
      new Map([["alpha", "file:///art/artist-portrait.jpg"]]),
    );

    const { searchResult3 } = await search3("alpha");

    expect(mockArtistArt).toHaveBeenCalledWith(["alpha"]);
    expect(searchResult3?.artist?.[0]?.coverArt).toBe(
      "file:///art/artist-portrait.jpg",
    );
    // Albums are unaffected: a sleeve is the right picture for a sleeve.
    expect(searchResult3?.album?.[0]?.coverArt).toBe(
      "file:///art/album-cover.jpg",
    );
  });

  it("keeps the track's artwork for an artist with no image of their own", async () => {
    mockSearch.mockResolvedValue([trackRow]);
    mockArtistArt.mockResolvedValue(new Map());

    const { searchResult3 } = await search3("alpha");

    expect(searchResult3?.artist?.[0]?.coverArt).toBe(
      "file:///art/album-cover.jpg",
    );
  });

  it("asks for nothing when the search matched no artist", async () => {
    mockSearch.mockResolvedValue([{ ...trackRow, artist_key: "" }]);

    const { searchResult3 } = await search3("alpha");

    expect(mockArtistArt).not.toHaveBeenCalled();
    expect(searchResult3?.artist).toEqual([]);
  });
});
