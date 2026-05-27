jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import useRecentSearches, { type RecentSearch } from "@/stores/recentSearches";

const get = () => useRecentSearches.getState();

const make = (id: string): RecentSearch => ({
  id,
  title: `t-${id}`,
  type: "song",
});

beforeEach(() => {
  useRecentSearches.setState({ recentSearches: [] }, false);
});

describe("recentSearches store", () => {
  it("addRecentSearch prepends new entries", () => {
    get().addRecentSearch(make("a"));
    get().addRecentSearch(make("b"));
    expect(get().recentSearches.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("does not re-add when the same object reference exists", () => {
    const item = make("a");
    get().addRecentSearch(item);
    get().addRecentSearch(item);
    expect(get().recentSearches).toHaveLength(1);
  });

  it("caps at 24 entries", () => {
    for (let i = 0; i < 30; i++) {
      get().addRecentSearch(make(`s${i}`));
    }
    expect(get().recentSearches).toHaveLength(24);
    expect(get().recentSearches[0].id).toBe("s29");
  });

  it("removeRecentSearch removes by id", () => {
    get().addRecentSearch(make("a"));
    get().addRecentSearch(make("b"));
    get().removeRecentSearch("a");
    expect(get().recentSearches.map((s) => s.id)).toEqual(["b"]);
  });

  it("clearRecentSearches empties the list", () => {
    get().addRecentSearch(make("a"));
    get().clearRecentSearches();
    expect(get().recentSearches).toEqual([]);
  });

  it("dedups by id+type and moves the entry to the front", () => {
    get().addRecentSearch(make("a"));
    get().addRecentSearch(make("b"));
    get().addRecentSearch(make("a"));
    expect(get().recentSearches).toHaveLength(2);
    expect(get().recentSearches.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("keeps entries with the same id but different type", () => {
    get().addRecentSearch({ id: "a", title: "song-a", type: "song" });
    get().addRecentSearch({ id: "a", title: "album-a", type: "album" });
    expect(get().recentSearches).toHaveLength(2);
    expect(get().recentSearches.map((s) => s.type)).toEqual(["album", "song"]);
  });

  it("__reset empties the list", () => {
    get().addRecentSearch(make("a"));
    get().__reset();
    expect(get().recentSearches).toEqual([]);
  });
});
