// The sidecar filenames are a *priority list* the user can edit, so what matters
// is that whatever they type survives into something the scanner can match: a
// stem, lowercased, in the order they wrote it.
import {
  artNamesOrDefault,
  DEFAULT_ALBUM_ART_NAMES,
  formatArtNames,
  parseArtNames,
} from "@/services/local/artNames";

describe("parseArtNames", () => {
  it("keeps the order typed, because order is the priority", () => {
    expect(parseArtNames("front, cover, folder")).toEqual([
      "front",
      "cover",
      "folder",
    ]);
  });

  // The obvious mistake: naming the file rather than the stem. Rejecting it
  // would leave a list that silently matches nothing.
  it("drops an extension, including foobar2000's wildcard form", () => {
    expect(parseArtNames("cover.jpg, folder.*, front")).toEqual([
      "cover",
      "folder",
      "front",
    ]);
  });

  it("normalizes case and whitespace, and de-duplicates", () => {
    expect(parseArtNames("  Cover  , COVER.PNG, front ")).toEqual([
      "cover",
      "front",
    ]);
  });

  it("accepts newlines and semicolons as separators", () => {
    expect(parseArtNames("cover\nfolder;front")).toEqual([
      "cover",
      "folder",
      "front",
    ]);
  });

  // A dotted name is how the user hides the file on disk; the entry the scanner
  // compares against still carries the dot, but the stem it ranks does not.
  it("strips a leading dot", () => {
    expect(parseArtNames(".cover")).toEqual(["cover"]);
  });

  it("rejects anything with a path separator in it", () => {
    expect(parseArtNames("art/cover, cover")).toEqual(["cover"]);
  });

  it("is empty for an empty or punctuation-only value", () => {
    expect(parseArtNames("")).toEqual([]);
    expect(parseArtNames("  , ,, ")).toEqual([]);
  });

  it("round-trips through formatArtNames", () => {
    const names = parseArtNames("cover, folder, front");
    expect(parseArtNames(formatArtNames(names))).toEqual(names);
  });
});

describe("artNamesOrDefault", () => {
  // Empty means "defaults", not "no sidecar art": it keeps today's list out of
  // everyone's MMKV, so a name added in a later release still reaches a user who
  // never opened the editor.
  it("falls back to the defaults when nothing is configured", () => {
    expect(artNamesOrDefault([], DEFAULT_ALBUM_ART_NAMES)).toBe(
      DEFAULT_ALBUM_ART_NAMES,
    );
    expect(artNamesOrDefault(undefined, DEFAULT_ALBUM_ART_NAMES)).toBe(
      DEFAULT_ALBUM_ART_NAMES,
    );
  });

  it("uses the configured list when there is one", () => {
    expect(artNamesOrDefault(["sleeve"], DEFAULT_ALBUM_ART_NAMES)).toEqual([
      "sleeve",
    ]);
  });
});
