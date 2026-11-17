import { laterReleaseYear } from "@/utils/albumDates";

const date = (year: number) => ({ year, month: 1, day: 1 });

describe("laterReleaseYear", () => {
  it("returns the release year of a reissue", () => {
    expect(
      laterReleaseYear({
        year: 1970,
        originalReleaseDate: date(1970),
        releaseDate: date(2016),
      }),
    ).toBe(2016);
  });

  it("compares against the album year without an original date", () => {
    expect(laterReleaseYear({ year: 1993, releaseDate: date(2011) })).toBe(
      2011,
    );
  });

  it("ignores a release in the same year as the original", () => {
    expect(
      laterReleaseYear({
        year: 2021,
        originalReleaseDate: date(2021),
        releaseDate: date(2021),
      }),
    ).toBeUndefined();
  });

  it("ignores a release date with nothing to compare it to", () => {
    expect(laterReleaseYear({ releaseDate: date(2016) })).toBeUndefined();
    expect(laterReleaseYear(undefined)).toBeUndefined();
  });
});
