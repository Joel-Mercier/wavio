import {
  availableLibrarySortFields,
  type LibrarySortEntry,
  librarySortSpecs,
} from "@/utils/librarySort";
import { effectiveSort, sortItems } from "@/utils/sort";

const specs = librarySortSpecs(1);

const album = (
  id: string,
  extra: Partial<LibrarySortEntry["row"]> = {},
): LibrarySortEntry => ({
  bucket: "albums",
  row: { id, name: id, artist: "Artist", year: 2000, songCount: 10, ...extra },
});
const artist = (
  id: string,
  extra: Partial<LibrarySortEntry["row"]> = {},
): LibrarySortEntry => ({
  bucket: "artists",
  row: { id, name: id, albumCount: 1, ...extra },
});
const playlist = (
  id: string,
  extra: Partial<LibrarySortEntry["row"]> = {},
): LibrarySortEntry => ({
  bucket: "playlists",
  row: { id, name: id, songCount: 5, duration: 300, ...extra },
});
const radio = (id: string): LibrarySortEntry => ({
  bucket: "radioStations",
  row: { id, name: id, dateAdded: 1 },
});
const folder = (id: string): LibrarySortEntry => ({
  bucket: "folders",
  row: { id, name: id },
});

const ids = (entries: LibrarySortEntry[]) =>
  entries.map((entry) => entry.row.id);

describe("availableLibrarySortFields", () => {
  it("offers only the shared fields on a list that mixes in radio and folders", () => {
    expect(
      availableLibrarySortFields(
        [album("a"), playlist("p"), radio("r"), folder("f")],
        specs,
      ),
    ).toEqual(["addedAt", "alphabetical", "random"]);
  });

  it("offers every album field the albums carry", () => {
    expect(
      availableLibrarySortFields(
        [
          album("a", {
            played: "2026-10-01",
            playCount: 2,
            userRating: 4,
            duration: 1800,
          }),
        ],
        specs,
      ),
    ).toEqual([
      "addedAt",
      "alphabetical",
      "artist",
      "year",
      "lastPlayed",
      "playCount",
      "rating",
      "songCount",
      "duration",
      "random",
    ]);
  });

  it("drops the fields no row has data for", () => {
    const fields = availableLibrarySortFields([album("a")], specs);
    expect(fields).not.toContain("lastPlayed");
    expect(fields).not.toContain("playCount");
    expect(fields).not.toContain("rating");
    expect(fields).not.toContain("duration");
  });

  it("keeps what albums and artists share", () => {
    expect(
      availableLibrarySortFields(
        [album("a", { userRating: 3 }), artist("b")],
        specs,
      ),
    ).toEqual(["addedAt", "alphabetical", "artist", "rating", "random"]);
  });

  it("keeps what albums and playlists share", () => {
    expect(
      availableLibrarySortFields(
        [album("a", { duration: 1800 }), playlist("p")],
        specs,
      ),
    ).toEqual(["addedAt", "alphabetical", "songCount", "duration", "random"]);
  });

  it("leaves the artist sort out on artists alone", () => {
    expect(availableLibrarySortFields([artist("b")], specs)).toEqual([
      "addedAt",
      "alphabetical",
      "albumCount",
      "random",
    ]);
  });

  it("hides the album count when the backend reports none", () => {
    expect(
      availableLibrarySortFields([artist("b", { albumCount: 0 })], specs),
    ).not.toContain("albumCount");
  });

  it("falls back to the shared fields with nothing listed", () => {
    expect(availableLibrarySortFields([], specs)).toEqual([
      "addedAt",
      "alphabetical",
      "random",
    ]);
  });

  it("lets a saved sort the rows can't carry render as the default", () => {
    const entries = [album("a"), radio("r")];
    expect(
      effectiveSort(
        "yearDesc",
        availableLibrarySortFields(entries, specs),
        "addedAtAsc",
      ),
    ).toBe("addedAtAsc");
  });
});

describe("librarySortSpecs", () => {
  it("files each artist right above their albums", () => {
    const entries = [
      album("Zebra", { artist: "Bowie", year: 1977 }),
      artist("Bowie"),
      album("Aladdin", { artist: "Bowie", year: 1973 }),
      album("Abbey Road", { artist: "Beatles", year: 1969 }),
      artist("Beatles"),
    ];
    expect(ids(sortItems(entries, "artistAsc", specs))).toEqual([
      "Beatles",
      "Abbey Road",
      "Bowie",
      "Aladdin",
      "Zebra",
    ]);
  });

  it("prefers the display artist on albums", () => {
    const entries = [
      album("a", { artist: "Zed", displayArtist: "Alpha" }),
      album("b", { artist: "Beta" }),
    ];
    expect(ids(sortItems(entries, "artistAsc", specs))).toEqual(["a", "b"]);
  });

  it("sorts albums by last play, unplayed ones last", () => {
    const entries = [
      album("old", { played: "2026-01-01" }),
      album("never"),
      album("new", { played: "2026-10-01" }),
    ];
    expect(ids(sortItems(entries, "lastPlayedDesc", specs))).toEqual([
      "new",
      "old",
      "never",
    ]);
  });

  it("keeps the old Recent order: favorited, created or added, undated first", () => {
    const entries: LibrarySortEntry[] = [
      album("starred", { starred: "2026-03-01" }),
      playlist("created", { created: "2026-02-01" }),
      radio("radio"),
      folder("folder"),
    ];
    expect(ids(sortItems(entries, "addedAtAsc", specs))).toEqual([
      "folder",
      "radio",
      "created",
      "starred",
    ]);
  });

  it("shuffles the same way for the same seed and another way for a new one", () => {
    const entries = Array.from({ length: 20 }, (_, i) => album(`a${i}`));
    const order = (seed: number) =>
      ids(sortItems(entries, "randomAsc", librarySortSpecs(seed)));
    expect(order(1)).toEqual(order(1));
    expect(order(1)).not.toEqual(order(2));
  });

  it("keeps the shuffled rows in place when one is added", () => {
    const entries = Array.from({ length: 20 }, (_, i) => album(`a${i}`));
    const before = ids(sortItems(entries, "randomAsc", specs));
    const after = ids(
      sortItems([...entries, album("new")], "randomAsc", specs),
    ).filter((id) => id !== "new");
    expect(after).toEqual(before);
  });
});
