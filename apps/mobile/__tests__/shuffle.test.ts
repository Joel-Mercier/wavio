import { dispersedShuffle, mulberry32, shuffleWithSeed } from "@/utils/shuffle";

type Item = { id: string; artist: string };

const makeItems = (spec: Record<string, number>): Item[] => {
  const out: Item[] = [];
  for (const [artist, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) out.push({ id: `${artist}${i}`, artist });
  }
  return out;
};

const longestRun = (items: Item[]): number => {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const item of items) {
    run = item.artist === previous ? run + 1 : 1;
    previous = item.artist;
    if (run > best) best = run;
  }
  return best;
};

describe("shuffleWithSeed", () => {
  test("is stable for a given seed and preserves the items", () => {
    const input = makeItems({ a: 10 });
    expect(shuffleWithSeed(input, 42)).toEqual(shuffleWithSeed(input, 42));
    expect(
      shuffleWithSeed(input, 42)
        .map((i) => i.id)
        .sort(),
    ).toEqual(input.map((i) => i.id).sort());
  });
});

describe("dispersedShuffle", () => {
  test("returns every input item exactly once", () => {
    const input = makeItems({ a: 4, b: 3, c: 5 });
    const out = dispersedShuffle(input, (i) => i.artist, mulberry32(7));
    expect(out).toHaveLength(input.length);
    expect(out.map((i) => i.id).sort()).toEqual(input.map((i) => i.id).sort());
  });

  test("spreads one artist's tracks apart instead of clustering them", () => {
    // 4 of 20 tracks by one artist: with a spacing of 5 they should never end
    // up adjacent, where a uniform shuffle regularly stacks two or three.
    const input = makeItems({ heavy: 4, b: 4, c: 4, d: 4, e: 4 });
    for (let seed = 1; seed <= 25; seed++) {
      const out = dispersedShuffle(input, (i) => i.artist, mulberry32(seed));
      expect(longestRun(out)).toBe(1);
    }
  });

  test("treats items without a group key as independent", () => {
    const input = makeItems({ a: 6, b: 6 });
    const out = dispersedShuffle(input, () => undefined, mulberry32(3));
    expect(out.map((i) => i.id).sort()).toEqual(input.map((i) => i.id).sort());
  });

  test("handles degenerate sizes", () => {
    expect(dispersedShuffle([], (i: Item) => i.artist)).toEqual([]);
    const one = makeItems({ a: 1 });
    expect(dispersedShuffle(one, (i) => i.artist)).toEqual(one);
  });
});
