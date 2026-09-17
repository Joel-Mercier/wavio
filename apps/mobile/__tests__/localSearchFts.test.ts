import { toFtsQuery } from "@/services/local/repository";
import { searchVariants } from "@/services/searchText";

jest.mock("@/services/local/db", () => ({
  getLocalLibraryDb: jest.fn(),
  libraryScope: () => "scope",
}));

describe("toFtsQuery", () => {
  it("turns each word into a quoted prefix term joined with AND", () => {
    expect(toFtsQuery("tyler the creator")).toBe(
      '"tyler"* AND "the"* AND "creator"*',
    );
  });

  it("offers the normalised spelling of a punctuated or accented word", () => {
    expect(toFtsQuery("don't stop")).toBe('("don\'t"* OR "dont"*) AND "stop"*');
    expect(toFtsQuery("Hæd")).toBe('("Hæd"* OR "haed"*)');
  });

  it("does not duplicate a word whose spelling is already plain", () => {
    expect(toFtsQuery("Tyler")).toBe('"Tyler"*');
  });

  it("strips FTS operators and ignores blank input", () => {
    expect(toFtsQuery('  "big" (poppa)* ')).toBe('"big"* AND "poppa"*');
    expect(toFtsQuery("   ")).toBeNull();
  });
});

describe("searchVariants", () => {
  it("emits only spellings that differ from the indexed word", () => {
    expect(
      searchVariants(["Big Poppa", "The Notorious B.I.G.", null, undefined]),
    ).toBe("big");
  });

  it("folds accents and punctuation per word and dedupes", () => {
    expect(searchVariants(["Plc.4 Mie Hæd", "Hæd (Live)", "a-ha"])).toBe(
      "plc4 haed live aha",
    );
  });

  it("is empty when nothing needs a variant", () => {
    expect(searchVariants(["Take On Me", "Queen"])).toBe("");
  });
});
