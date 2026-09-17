// Jellyfin ≤ 10.11 matches `SearchTerm` as a plain substring of a name that
// keeps its punctuation, so the client retries an empty first page with the
// longest alphanumeric run and applies the punctuation-blind match itself.
const mockGet = jest.fn();

jest.mock("@/services/jellyfin/index", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ jellyfinUserId: "user-1" }) },
}));

import { search3 } from "@/services/jellyfin/searching";

type Call = { url: string; params: Record<string, unknown> };

const calls = (): Call[] =>
  mockGet.mock.calls.map(([url, config]) => ({
    url,
    params: (config as { params: Record<string, unknown> }).params,
  }));

const artistCalls = () => calls().filter((c) => c.url === "/Artists");

const respondWith = (
  byTerm: Record<string, Array<{ Id: string; Name: string }>>,
) => {
  mockGet.mockImplementation(
    async (_url: string, config: { params: { SearchTerm: string } }) => ({
      data: { Items: byTerm[config.params.SearchTerm] ?? [] },
    }),
  );
};

const artistsOnly = { albumCount: 0, songCount: 0, artistCount: 12 };

beforeEach(() => {
  mockGet.mockReset();
});

describe("Jellyfin search fallback", () => {
  it("sends the raw query once when the server finds it", async () => {
    respondWith({
      "Tyler, the Creator": [{ Id: "a1", Name: "Tyler, the Creator" }],
    });
    const rsp = await search3("Tyler, the Creator", artistsOnly);
    expect(rsp.searchResult3.artist?.map((a) => a.name)).toEqual([
      "Tyler, the Creator",
    ]);
    expect(artistCalls().map((c) => c.params.SearchTerm)).toEqual([
      "Tyler, the Creator",
    ]);
  });

  it("retries an empty page with the longest run and filters client-side", async () => {
    respondWith({
      creator: [
        { Id: "a1", Name: "Tyler, the Creator" },
        { Id: "a2", Name: "Creators of Doom" },
        { Id: "a3", Name: "The Creator" },
      ],
    });
    const rsp = await search3("Tyler the Creator", artistsOnly);
    expect(rsp.searchResult3.artist?.map((a) => a.name)).toEqual([
      "Tyler, the Creator",
    ]);
    const [first, second] = artistCalls();
    expect(first.params.SearchTerm).toBe("Tyler the Creator");
    expect(second.params).toMatchObject({
      SearchTerm: "creator",
      Limit: 100,
      StartIndex: 0,
    });
  });

  it("folds accents off the probe so it matches the server's CleanName", async () => {
    respondWith({ sigur: [{ Id: "a1", Name: "Sigur Rós" }] });
    await search3("Sigur Rós", artistsOnly);
    expect(artistCalls()[1].params.SearchTerm).toBe("sigur");
  });

  it("caps the filtered fallback at the requested count", async () => {
    respondWith({
      notorious: Array.from({ length: 5 }, (_, i) => ({
        Id: `a${i}`,
        Name: `The Notorious B.I.G. ${i}`,
      })),
    });
    const rsp = await search3("notorious big", {
      ...artistsOnly,
      artistCount: 2,
    });
    expect(rsp.searchResult3.artist).toHaveLength(2);
  });

  it("does not retry a single-word query", async () => {
    respondWith({});
    await search3("Tyler", artistsOnly);
    expect(artistCalls()).toHaveLength(1);
  });

  it("does not retry a punctuation-only query", async () => {
    respondWith({});
    await search3("!!!", artistsOnly);
    expect(artistCalls()).toHaveLength(1);
  });

  it("does not retry past the first page", async () => {
    respondWith({});
    await search3("Tyler the Creator", { ...artistsOnly, artistOffset: 12 });
    expect(artistCalls()).toHaveLength(1);
  });

  it("skips kinds requested with a count of 0", async () => {
    respondWith({});
    await search3("Tyler the Creator", artistsOnly);
    expect(calls().every((c) => c.url === "/Artists")).toBe(true);
  });
});
