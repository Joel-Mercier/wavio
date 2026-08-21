import type { ArtistID3 } from "@/services/openSubsonic/types";
import {
  ARTIST_SORT_FIELDS,
  artistSortSpecs,
  DEFAULT_ARTIST_SORT,
} from "@/utils/artistSort";
import { availableSortFields, sortItems } from "@/utils/sort";

const artist = (partial: Partial<ArtistID3> & { id: string }): ArtistID3 => ({
  name: partial.id,
  albumCount: 0,
  ...partial,
});

const SPECS = artistSortSpecs();

describe("artistSortSpecs", () => {
  it("defaults to the backend's alphabetical order", () => {
    expect(DEFAULT_ARTIST_SORT).toBe("alphabeticalAsc");
  });

  // buildArtistIndex buckets on sortKey(name, ignoredArticles), so the flat
  // sort has to strip the same articles or it files "The Beatles" under `t`
  // while the index bar files it under `b`.
  it("sorts past the leading articles the server declares", () => {
    const artists = [
      artist({ id: "beatles", name: "The Beatles" }),
      artist({ id: "cure", name: "Cure" }),
      artist({ id: "abba", name: "ABBA" }),
    ];
    const specs = artistSortSpecs("The El La");
    expect(
      sortItems(artists, "alphabeticalAsc", specs).map((a) => a.id),
    ).toEqual(["abba", "beatles", "cure"]);
    expect(
      sortItems(artists, "alphabeticalDesc", specs).map((a) => a.id),
    ).toEqual(["cure", "beatles", "abba"]);
    // A server that declares none leaves the article in the key.
    expect(
      sortItems(artists, "alphabeticalAsc", SPECS).map((a) => a.id),
    ).toEqual(["abba", "cure", "beatles"]);
  });

  it("sorts by album count, breaking ties by name", () => {
    const artists = [
      artist({ id: "b", name: "B", albumCount: 2 }),
      artist({ id: "a", name: "A", albumCount: 2 }),
      artist({ id: "c", name: "C", albumCount: 9 }),
    ];
    expect(
      sortItems(artists, "albumCountDesc", SPECS).map((a) => a.id),
    ).toEqual(["c", "a", "b"]);
  });

  // `starred` is typed as a Date but only the local library builds one — every
  // JSON backend hands back the raw ISO string, so both shapes have to sort.
  it("sorts by when the artist was favorited", () => {
    const artists = [
      artist({ id: "old", starred: "2024-01-01T00:00:00Z" as unknown as Date }),
      artist({ id: "never" }),
      artist({ id: "new", starred: new Date("2026-01-01") }),
    ];
    // Unfavorited artists have no value, so they sort last either way.
    expect(
      sortItems(artists, "favoritedAtDesc", SPECS).map((a) => a.id),
    ).toEqual(["new", "old", "never"]);
    expect(
      sortItems(artists, "favoritedAtAsc", SPECS).map((a) => a.id),
    ).toEqual(["old", "new", "never"]);
  });
});

describe("availableSortFields for artists", () => {
  // Jellyfin's /Artists/AlbumArtists never reports AlbumCount, so the option
  // hides itself off the data rather than needing a capability flag.
  it("hides albumCount when every artist reports zero", () => {
    const artists = [artist({ id: "a" }), artist({ id: "b" })];
    expect(availableSortFields(artists, SPECS, ARTIST_SORT_FIELDS)).toEqual([
      "alphabetical",
    ]);
  });

  it("offers the fields the library actually has data for", () => {
    const artists = [
      artist({ id: "a", albumCount: 3, userRating: 4 }),
      artist({ id: "b" }),
    ];
    expect(availableSortFields(artists, SPECS, ARTIST_SORT_FIELDS)).toEqual([
      "alphabetical",
      "albumCount",
      "rating",
    ]);
  });
});
