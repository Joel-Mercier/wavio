import {
  kanaQueryVariants,
  withKanaFallback,
} from "@/services/kanaSearchFallback";

describe("kanaQueryVariants", () => {
  it.each([
    ["yorushika", ["よるしか", "ヨルシカ"]],
    ["ヨルシカ", ["yorushika", "よるしか"]],
    ["よるしか", ["yorushika", "ヨルシカ"]],
    ["masayoshi takanaka", ["まさよし たかなか", "マサヨシ タカナカ"]],
    ["yorushika live", ["よるしか live", "ヨルシカ live"]],
    ["ヨルシカ live", ["yorushika live", "よるしか live"]],
  ])("%p → %p", (query, expected) => {
    expect(kanaQueryVariants(query)).toEqual(expected);
  });

  it.each([
    ["tyler"],
    ["live"],
    ["tyler creator"],
    ["高中正義"],
    ["1999"],
    ["  "],
    ["+/-"],
  ])("has nothing to offer for %p", (query) => {
    expect(kanaQueryVariants(query)).toEqual([]);
  });
});

type Result = {
  artist?: Array<{ id: string }>;
  album?: Array<{ id: string }>;
  song?: Array<{ id: string }>;
};
type Envelope = { searchResult3?: Result };

const wrap = (search: jest.Mock) =>
  withKanaFallback(
    search as (q: string, o: Record<string, unknown>) => Promise<Envelope>,
    (e: Envelope) => e.searchResult3,
    (e: Envelope, searchResult3: Result) => ({ ...e, searchResult3 }),
  );

const respond = (byQuery: Record<string, Result>) =>
  jest.fn(async (query: string, _opts: Record<string, unknown>) => ({
    searchResult3: byQuery[query] ?? { artist: [], album: [], song: [] },
  }));

describe("withKanaFallback", () => {
  it("leaves a first page that has hits alone", async () => {
    const search = respond({
      yorushika: { artist: [{ id: "a1" }], album: [{ id: "b1" }], song: [] },
    });
    const result = await wrap(search)("yorushika", { songCount: 0 });
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.searchResult3?.artist).toEqual([{ id: "a1" }]);
  });

  it("fills only the empty sections from the kana forms, deduped", async () => {
    const search = respond({
      yorushika: { artist: [], album: [], song: [{ id: "s1" }] },
      よるしか: { artist: [{ id: "a1" }], album: [], song: [{ id: "s9" }] },
      ヨルシカ: {
        artist: [{ id: "a1" }, { id: "a2" }],
        album: [{ id: "b1" }],
        song: [{ id: "s9" }],
      },
    });
    const result = await wrap(search)("yorushika", {
      artistCount: 5,
      albumCount: 5,
      songCount: 5,
    });
    expect(search.mock.calls.map(([q]) => q)).toEqual([
      "yorushika",
      "よるしか",
      "ヨルシカ",
    ]);
    // The section that already had a hit is not re-requested.
    expect(search.mock.calls[1][1]).toMatchObject({
      artistCount: 5,
      albumCount: 5,
      songCount: 0,
    });
    expect(result.searchResult3).toEqual({
      artist: [{ id: "a1" }, { id: "a2" }],
      album: [{ id: "b1" }],
      song: [{ id: "s1" }],
    });
  });

  it("caps the filled section at the requested count", async () => {
    const search = respond({
      ヨルシカ: { artist: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] },
    });
    const result = await wrap(search)("yorushika", { artistCount: 2 });
    expect(result.searchResult3?.artist).toEqual([{ id: "a1" }, { id: "a2" }]);
  });

  it("does not retry a section the caller did not ask for", async () => {
    const search = respond({});
    await wrap(search)("yorushika", {
      artistCount: 0,
      albumCount: 0,
      songCount: 0,
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not retry past the first page", async () => {
    const search = respond({});
    await wrap(search)("yorushika", {
      artistOffset: 20,
      albumCount: 0,
      songCount: 0,
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not retry a query with no kana form", async () => {
    const search = respond({});
    await wrap(search)("tyler", {});
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("passes an envelope without a result through", async () => {
    const search = jest.fn(async () => ({}));
    const result = await wrap(search)("yorushika", {});
    expect(result).toEqual({});
    expect(search).toHaveBeenCalledTimes(1);
  });
});
