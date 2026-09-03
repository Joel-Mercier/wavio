import type { AlbumID3 } from "@/services/openSubsonic/types";
import {
  albumMatchesReleaseTypes,
  collectReleaseTypeFilters,
  UNTAGGED_RELEASE_TYPE,
} from "@/utils/releaseTypes";

function album(id: string, releaseTypes?: string[]): AlbumID3 {
  return {
    id,
    name: id,
    created: new Date(0),
    duration: 0,
    songCount: 0,
    releaseTypes,
  };
}

describe("collectReleaseTypeFilters", () => {
  it("collapses case and punctuation variants into one option", () => {
    const options = collectReleaseTypeFilters([
      album("a", ["Album"]),
      album("b", ["album"]),
      album("c", ["DJ-mix"]),
      album("d", ["djmix"]),
    ]);
    expect(options.map((o) => o.key)).toEqual(["album", "djmix"]);
    expect(options[0].label).toBe("Album");
  });

  it("orders known types by the display order", () => {
    const options = collectReleaseTypeFilters([
      album("a", ["single"]),
      album("b", ["compilation"]),
      album("c", ["album"]),
      album("d", ["ep"]),
    ]);
    expect(options.map((o) => o.key)).toEqual([
      "album",
      "ep",
      "single",
      "compilation",
    ]);
  });

  it("puts unknown types after known ones, alphabetically", () => {
    const options = collectReleaseTypeFilters([
      album("a", ["zeitgeist"]),
      album("b", ["bootleg"]),
      album("c", ["album"]),
    ]);
    expect(options.map((o) => o.key)).toEqual([
      "album",
      "bootleg",
      "zeitgeist",
    ]);
  });

  it("appends the untagged option last, only when an untyped album exists", () => {
    expect(
      collectReleaseTypeFilters([album("a", ["album"]), album("b")]).map(
        (o) => o.key,
      ),
    ).toEqual(["album", UNTAGGED_RELEASE_TYPE]);
    expect(
      collectReleaseTypeFilters([album("a", ["album"])]).map((o) => o.key),
    ).toEqual(["album"]);
  });

  it("yields a single option when nothing is tagged, so the row stays hidden", () => {
    const options = collectReleaseTypeFilters([
      album("a"),
      album("b", []),
      album("c"),
    ]);
    expect(options).toHaveLength(1);
    expect(options[0].key).toBe(UNTAGGED_RELEASE_TYPE);
  });

  it("treats an album whose types all normalize to nothing as untagged", () => {
    const options = collectReleaseTypeFilters([
      album("a", ["album"]),
      album("b", ["-"]),
    ]);
    expect(options.map((o) => o.key)).toEqual(["album", UNTAGGED_RELEASE_TYPE]);
  });

  it("keeps a literal 'Untagged' tag distinct from the untagged option", () => {
    const options = collectReleaseTypeFilters([
      album("a", ["Untagged"]),
      album("b"),
    ]);
    expect(options).toHaveLength(2);
    expect(new Set(options.map((o) => o.key)).size).toBe(2);
  });

  it("returns nothing for an empty discography", () => {
    expect(collectReleaseTypeFilters([])).toEqual([]);
  });
});

describe("albumMatchesReleaseTypes", () => {
  it("matches everything when no filter is selected", () => {
    expect(albumMatchesReleaseTypes(album("a", ["ep"]), [])).toBe(true);
    expect(albumMatchesReleaseTypes(album("b"), [])).toBe(true);
  });

  it("ORs across the selection and normalizes the album's own types", () => {
    const live = album("a", ["Album", "Live"]);
    expect(albumMatchesReleaseTypes(live, ["live"])).toBe(true);
    expect(albumMatchesReleaseTypes(live, ["ep", "album"])).toBe(true);
    expect(albumMatchesReleaseTypes(live, ["ep"])).toBe(false);
  });

  it("matches an album with only empty-normalizing types as untagged", () => {
    const dashed = album("a", ["-"]);
    expect(albumMatchesReleaseTypes(dashed, ["album"])).toBe(false);
    expect(albumMatchesReleaseTypes(dashed, [UNTAGGED_RELEASE_TYPE])).toBe(
      true,
    );
  });

  it("matches an untyped album only against the untagged option", () => {
    expect(albumMatchesReleaseTypes(album("a"), ["album"])).toBe(false);
    expect(
      albumMatchesReleaseTypes(album("a"), [UNTAGGED_RELEASE_TYPE, "album"]),
    ).toBe(true);
  });
});
