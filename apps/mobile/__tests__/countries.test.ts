import { countryName } from "@/utils/countries";

describe("countryName", () => {
  it("names an alpha-3 code in the requested language", () => {
    expect(countryName("USA", "en")).toBe("United States");
    expect(countryName("DEU", "fr")).toBe("Allemagne");
  });

  it("accepts a code in any case", () => {
    expect(countryName("fra", "en")).toBe("France");
  });

  it("falls back to the code it was given when it maps to nothing", () => {
    // Services hand these out unvalidated, and a row labelled with the raw code
    // is a great deal better than a row that throws.
    expect(countryName("ZZZ", "en")).toBe("ZZZ");
    expect(countryName("", "en")).toBe("");
  });

  describe("without Intl.DisplayNames", () => {
    // Which is the case on Hermes: it implements Collator, DateTimeFormat and
    // NumberFormat and nothing else, so this is the path the app actually runs.
    // biome-ignore lint/suspicious/noExplicitAny: the global is read-only to TS
    const intl = Intl as any;
    const real = intl.DisplayNames;

    beforeEach(() => {
      intl.DisplayNames = undefined;
    });
    afterEach(() => {
      intl.DisplayNames = real;
    });

    it("uses the shipped name rather than the code", () => {
      expect(countryName("DEU", "fr")).toBe("Germany");
      expect(countryName("USA", "en")).toBe("United States");
    });

    it("keeps the everyday name, not ISO's formal one", () => {
      expect(countryName("GBR")).toBe("United Kingdom");
      expect(countryName("KOR")).toBe("South Korea");
    });
  });
});
