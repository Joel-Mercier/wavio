import { getCapabilities } from "@/services/backend/capabilities";
import type { Genre } from "@/services/openSubsonic/types";
import {
  GENRE_SORT_FIELDS,
  GENRE_SORT_SPECS,
  genreSortEnabled,
} from "@/utils/genreSort";
import { availableSortFields, sortItems } from "@/utils/sort";

const genre = (value: string, fields: Partial<Genre> = {}): Genre => ({
  value,
  ...fields,
});

const values = (genres: Genre[]) => genres.map((g) => g.value);

describe("Genre sort fields", () => {
  const withCounts = [
    genre("Rock", { songCount: 30, albumCount: 3 }),
    genre("Ambient", { songCount: 10, albumCount: 2 }),
  ];

  it("sorts by name and by counts", () => {
    expect(
      values(sortItems(withCounts, "alphabeticalAsc", GENRE_SORT_SPECS)),
    ).toEqual(["Ambient", "Rock"]);
    expect(
      values(sortItems(withCounts, "songCountDesc", GENRE_SORT_SPECS)),
    ).toEqual(["Rock", "Ambient"]);
    expect(
      values(sortItems(withCounts, "albumCountAsc", GENRE_SORT_SPECS)),
    ).toEqual(["Ambient", "Rock"]);
  });

  it("offers every field on a backend with genre counts", () => {
    expect(
      availableSortFields(
        withCounts,
        GENRE_SORT_SPECS,
        GENRE_SORT_FIELDS,
        genreSortEnabled(getCapabilities("navidrome")),
      ),
    ).toEqual(GENRE_SORT_FIELDS);
  });

  it("keeps alphabetical on a backend without genre counts", () => {
    expect(
      availableSortFields(
        withCounts,
        GENRE_SORT_SPECS,
        GENRE_SORT_FIELDS,
        genreSortEnabled(getCapabilities("jellyfin")),
      ),
    ).toEqual(["alphabetical"]);
  });

  it("keeps alphabetical when the counts are missing from the data", () => {
    expect(
      availableSortFields(
        [genre("Rock"), genre("Ambient")],
        GENRE_SORT_SPECS,
        GENRE_SORT_FIELDS,
        genreSortEnabled(getCapabilities("navidrome")),
      ),
    ).toEqual(["alphabetical"]);
  });
});
