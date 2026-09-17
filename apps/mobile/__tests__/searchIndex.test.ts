import { createSearchIndex } from "@/services/searchIndex";

const artists = [
  { id: "1", name: "Tyler, the Creator" },
  { id: "2", name: "The Notorious B.I.G." },
  { id: "3", name: "a-ha" },
  { id: "4", name: "AC/DC" },
  { id: "5", name: "Sigur Rós" },
  { id: "6", name: "Tyler Childers" },
  { id: "7", name: "Big Poppa" },
  { id: "8", name: "!!!" },
  { id: "9", name: "高中正義" },
  { id: "10", name: "ヨルシカ" },
  { id: "11", name: "あいみょん" },
  { id: "12", name: "トウキョウ事変" },
];

const names = (query: string, limit?: number) =>
  createSearchIndex(artists, ["name"])
    .search(query, limit)
    .map((r) => r.item.name);

describe("createSearchIndex", () => {
  it.each([
    ["Tyler the Creator", "Tyler, the Creator"],
    ["Tyler, the Creator", "Tyler, the Creator"],
    ["tyler creator", "Tyler, the Creator"],
    ["creator tyler", "Tyler, the Creator"],
    ["notorious big", "The Notorious B.I.G."],
    ["aha", "a-ha"],
    ["a ha", "a-ha"],
    ["acdc", "AC/DC"],
    ["ac/dc", "AC/DC"],
    ["sigur ros", "Sigur Rós"],
    ["高中", "高中正義"],
    ["yorushika", "ヨルシカ"],
    ["よるしか", "ヨルシカ"],
    ["ヨルシカ", "ヨルシカ"],
    ["aimyon", "あいみょん"],
    ["tokyo", "トウキョウ事変"],
    ["toukyou", "トウキョウ事変"],
    ["tōkyō", "トウキョウ事変"],
  ])("%p finds %p first", (query, expected) => {
    expect(names(query)[0]).toBe(expected);
  });

  it("scores a punctuation-only difference as a perfect match", () => {
    const [top] = createSearchIndex(artists, ["name"]).search(
      "Tyler the Creator",
    );
    expect(top.item.name).toBe("Tyler, the Creator");
    expect(top.score ?? 1).toBeLessThan(0.05);
  });

  it("requires every word of the query", () => {
    expect(names("tyler childers")).toEqual(["Tyler Childers"]);
  });

  it("does not fuzz short words onto unrelated names", () => {
    expect(names("big")).not.toContain("Sigur Rós");
    expect(names("tokyo")).toEqual(["トウキョウ事変"]);
  });

  it("still tolerates a typo in longer words", () => {
    expect(names("tylr creator")).toEqual(["Tyler, the Creator"]);
  });

  it("matches a punctuation-only query literally", () => {
    expect(names("!!!")).toEqual(["!!!"]);
  });

  it("honours the limit", () => {
    expect(names("tyler", 1)).toHaveLength(1);
  });

  it("returns nothing for a blank query", () => {
    expect(names("  ")).toEqual([]);
  });

  it("searches several keys", () => {
    const songs = createSearchIndex(
      [
        { title: "Yonkers", artist: "Tyler, the Creator" },
        { title: "Take On Me", artist: "a-ha" },
      ],
      ["title", "artist"],
    );
    expect(songs.search("tyler yonkers").map((r) => r.item.title)).toEqual([
      "Yonkers",
    ]);
  });
});
