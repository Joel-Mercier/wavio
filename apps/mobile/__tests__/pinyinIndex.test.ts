import type { ArtistID3 } from "@/services/openSubsonic/types";
import {
  buildArtistIndex,
  hasCJK,
  indexLetter,
  sortKey,
} from "@/services/pinyinIndex";

const artist = (name: string): ArtistID3 => ({
  id: name,
  name,
  albumCount: 0,
});

describe("hasCJK", () => {
  it("is false for latin names", () => {
    expect(hasCJK("The Beatles")).toBe(false);
  });
  it("is true for simplified and traditional chinese", () => {
    expect(hasCJK("周杰伦")).toBe(true);
    expect(hasCJK("張惠妹")).toBe(true);
  });
});

describe("indexLetter", () => {
  it("uppercases a latin initial", () => {
    expect(indexLetter("beatles")).toBe("B");
  });
  it("folds diacritics onto the base letter", () => {
    expect(indexLetter("Édith Piaf")).toBe("E");
  });
  it("strips a leading ignored article", () => {
    expect(indexLetter("The xx", "The El La")).toBe("X");
  });
  it("indexes a chinese name by its surname pinyin initial", () => {
    expect(indexLetter("周杰伦")).toBe("Z");
    expect(indexLetter("陈奕迅")).toBe("C");
  });
  it("buckets digits and symbols under #", () => {
    expect(indexLetter("123")).toBe("#");
    expect(indexLetter("")).toBe("#");
  });
});

describe("sortKey", () => {
  it("returns full pinyin for chinese names", () => {
    expect(sortKey("周杰伦")).toContain("zhou");
  });
  it("lowercases latin names for stable ordering", () => {
    expect(sortKey("Beatles")).toBe("beatles");
  });
});

describe("buildArtistIndex", () => {
  it("sorts the # bucket last and groups chinese by pinyin", () => {
    const index = buildArtistIndex([
      artist("周杰伦"),
      artist("Adele"),
      artist("123 Band"),
      artist("陈奕迅"),
    ]);
    expect(index.map((b) => b.name)).toEqual(["A", "C", "Z", "#"]);
  });

  it("orders artists inside a bucket by sort key", () => {
    const index = buildArtistIndex([artist("Zebra"), artist("Zara")]);
    const zBucket = index.find((b) => b.name === "Z");
    expect(zBucket?.artist?.map((a) => a.name)).toEqual(["Zara", "Zebra"]);
  });
});
