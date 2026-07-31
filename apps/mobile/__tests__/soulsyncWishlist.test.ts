jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

import { albumNameOf } from "@/services/soulsync/downloads";
import type {
  SoulSyncDownloadTask,
  SoulSyncTrack,
  SoulSyncWatchlistArtist,
  SoulSyncWishlistTrack,
} from "@/services/soulsync/types";
import {
  watchlistArtistId,
  watchlistArtistIds,
} from "@/services/soulsync/watchlist";
import {
  toWishlistTrackData,
  wishlistArtworkUrl,
} from "@/services/soulsync/wishlist";

const track = (fields: Partial<SoulSyncTrack> = {}): SoulSyncTrack => ({
  id: "2263033",
  name: "Sultans Of Swing",
  artists: ["Dire Straits"],
  album: "Dire Straits",
  duration_ms: 348000,
  popularity: 100,
  preview_url: null,
  image_url: null,
  ...fields,
});

const task = (
  fields: Partial<SoulSyncDownloadTask> = {},
): SoulSyncDownloadTask => ({
  id: "task-1",
  status: "downloading",
  track_name: "Sultans Of Swing",
  artist_name: "Dire Straits",
  album_name: "Dire Straits",
  username: "peer",
  filename: null,
  progress: 0,
  size: null,
  error: null,
  batch_id: null,
  track_index: null,
  retry_count: 0,
  status_change_time: null,
  ...fields,
});

describe("toWishlistTrackData", () => {
  // SoulSync overwrites a non-dict album with the *track* name on the way in,
  // which then poisons the artist + album + title query its download worker
  // generates. The dict is the whole point of the mapper.
  it("sends album as an object so the stored album name survives", () => {
    const data = toWishlistTrackData(track());
    expect(data.album).toEqual({ name: "Dire Straits", images: [] });
  });

  it("keeps artists as flat strings", () => {
    expect(toWishlistTrackData(track()).artists).toEqual(["Dire Straits"]);
  });

  it("carries cover art through as a Spotify-shaped images array", () => {
    const data = toWishlistTrackData(track({ image_url: "https://c/x.jpg" }));
    expect(data.album.images).toEqual([{ url: "https://c/x.jpg" }]);
  });

  // A missing album would otherwise store an empty name, and the generated
  // query would carry a stray empty term.
  it("falls back to the track name when the album is missing", () => {
    expect(toWishlistTrackData(track({ album: "" })).album.name).toBe(
      "Sultans Of Swing",
    );
  });
});

describe("albumNameOf", () => {
  it("reads a plain string album", () => {
    expect(albumNameOf(task())).toBe("Dire Straits");
  });

  // /downloads falls back to the stored track payload's `album` when the task
  // carries no explicit name — and that is the object the wishlist requires.
  // Rendering it straight into a <Text> would throw.
  it("unwraps the object form the endpoint returns", () => {
    expect(albumNameOf(task({ album_name: { name: "Dire Straits" } }))).toBe(
      "Dire Straits",
    );
  });

  it("returns null for a missing or nameless album", () => {
    expect(albumNameOf(task({ album_name: null }))).toBeNull();
    expect(albumNameOf(task({ album_name: {} }))).toBeNull();
  });
});

const wishlistRow = (
  fields: Partial<SoulSyncWishlistTrack> = {},
): SoulSyncWishlistTrack => ({
  id: 1,
  spotify_track_id: "2263033",
  track_name: "Sultans Of Swing",
  artist_name: "Dire Straits",
  album_name: "Dire Straits",
  retry_count: 0,
  last_attempted: null,
  failure_reason: null,
  ...fields,
});

describe("wishlistArtworkUrl", () => {
  // /downloads carries no artwork at all, so the queue's cover art comes from
  // the wishlist row the download originated from.
  it("reads the cover out of the stored track payload", () => {
    const row = wishlistRow({
      track_data: { album: { name: "Dire Straits", images: [{ url: "u" }] } },
    });
    expect(wishlistArtworkUrl(row)).toBe("u");
  });

  it("is undefined when the payload carries no image", () => {
    expect(wishlistArtworkUrl(wishlistRow())).toBeUndefined();
    expect(
      wishlistArtworkUrl(
        wishlistRow({ track_data: { album: { images: [] } } }),
      ),
    ).toBeUndefined();
  });
});

const watched = (
  fields: Partial<SoulSyncWatchlistArtist> = {},
): SoulSyncWatchlistArtist => ({
  id: 5,
  artist_name: "Daft Punk",
  ...fields,
});

// A watchlist row has no `artist_id`; reading one gave `undefined` and every
// call went to /watchlist/undefined, which the server can't match.
describe("watchlistArtistId", () => {
  it("prefers the column the row's source names", () => {
    const artist = watched({
      source: "deezer",
      spotify_artist_id: "spot-1",
      deezer_artist_id: "deez-1",
    });
    expect(watchlistArtistId(artist)).toBe("deez-1");
  });

  it("falls back to any populated provider column", () => {
    expect(watchlistArtistId(watched({ itunes_artist_id: "it-1" }))).toBe(
      "it-1",
    );
  });

  // A source naming a column the row never filled must not shadow the id it
  // does have.
  it("ignores a source whose column is empty", () => {
    const artist = watched({ source: "amazon", musicbrainz_artist_id: "mb-1" });
    expect(watchlistArtistId(artist)).toBe("mb-1");
  });

  it("is null when the row carries no provider id at all", () => {
    expect(watchlistArtistId(watched())).toBeNull();
  });

  // The server matches a given id against every column, so "is this artist
  // watched?" has to as well — a Deezer search result can match a row that was
  // added from Spotify.
  it("lists every provider id the row carries", () => {
    const artist = watched({
      spotify_artist_id: "spot-1",
      deezer_artist_id: "deez-1",
    });
    expect(watchlistArtistIds(artist)).toEqual(["spot-1", "deez-1"]);
  });
});
