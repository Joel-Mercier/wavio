import {
  alphanumericRuns,
  isLiteralQuery,
  matchesAllTokens,
  normalizeSearchText,
  searchTokens,
} from "@/services/searchText";

describe("normalizeSearchText", () => {
  it.each([
    ["Tyler, the Creator", "tyler the creator"],
    ["The Notorious B.I.G.", "the notorious big"],
    ["a-ha", "aha"],
    ["AC/DC", "acdc"],
    ["Don't Stop Me Now", "dont stop me now"],
    ["Runnin’ Thru the 7th", "runnin thru the 7th"],
    ["Panic! at the Disco", "panic at the disco"],
    ["Sigur Rós", "sigur ros"],
    ["Bjørk", "bjork"],
    ["Plc.4 Mie Hæd", "plc4 mie haed"],
    ["Mötley Crüe", "motley crue"],
    ["Straße", "strasse"],
    ["[Chali] - Linkin Park", "chali linkin park"],
    ["ＡＢＣ", "abc"],
    ["高中正義", "高中正義"],
    ["がんばれ", "がんばれ"],
    ["  spaced   out  ", "spaced out"],
    ["!!!", ""],
  ])("%p → %p", (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });
});

describe("searchTokens", () => {
  it("splits on whitespace after normalising", () => {
    expect(searchTokens("Tyler, the Creator")).toEqual([
      "tyler",
      "the",
      "creator",
    ]);
  });

  it("is empty for a punctuation-only query", () => {
    expect(searchTokens("+/-")).toEqual([]);
  });
});

describe("isLiteralQuery", () => {
  it("is true only when the query has text but no word characters", () => {
    expect(isLiteralQuery("!!!")).toBe(true);
    expect(isLiteralQuery("   ")).toBe(false);
    expect(isLiteralQuery("a!")).toBe(false);
  });
});

describe("matchesAllTokens", () => {
  it("ignores punctuation on both sides", () => {
    expect(matchesAllTokens("Tyler, the Creator", "tyler the creator")).toBe(
      true,
    );
    expect(matchesAllTokens("Tyler the Creator", "Tyler, the Creator")).toBe(
      true,
    );
  });

  it("requires every word, in any order", () => {
    expect(matchesAllTokens("Tyler, the Creator", "creator tyler")).toBe(true);
    expect(matchesAllTokens("Tyler, the Creator", "tyler childers")).toBe(
      false,
    );
  });

  it("matches concat forms", () => {
    expect(matchesAllTokens("The Notorious B.I.G.", "big")).toBe(true);
    expect(matchesAllTokens("a-ha", "aha")).toBe(true);
    expect(matchesAllTokens("Don't Stop", "dont")).toBe(true);
  });

  it("searches across several fields", () => {
    expect(
      matchesAllTokens(["Yonkers", "Tyler, the Creator", undefined], "tyler"),
    ).toBe(true);
  });

  it("matches a punctuation-only query literally", () => {
    expect(matchesAllTokens("!!!", "!!!")).toBe(true);
    expect(matchesAllTokens("Chk Chk Chk", "!!!")).toBe(false);
  });

  it("never matches an empty query", () => {
    expect(matchesAllTokens("anything", "   ")).toBe(false);
  });
});

describe("alphanumericRuns", () => {
  it("splits on punctuation and orders longest first", () => {
    expect(alphanumericRuns("The Notorious B.I.G.")).toEqual([
      "Notorious",
      "The",
      "B",
      "I",
      "G",
    ]);
  });

  it("keeps accents so the caller decides how to fold them", () => {
    expect(alphanumericRuns("Sigur Rós")).toEqual(["Sigur", "Rós"]);
  });
});
