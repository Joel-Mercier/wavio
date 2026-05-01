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
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";

const get = () => useRecentPlays.getState();

const make = (id: string, type: RecentPlay["type"] = "album"): RecentPlay => ({
  id,
  title: `t-${id}`,
  type,
});

const favorites: RecentPlay = {
  id: "favorites",
  title: "Favorites",
  type: "favorites",
};

beforeEach(() => {
  useRecentPlays.setState({ recentPlays: [] }, false);
});

describe("recentPlays store - addRecentPlay", () => {
  it("prepends new items", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    expect(get().recentPlays.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("ignores items already present (id-based)", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("a"));
    expect(get().recentPlays).toHaveLength(1);
  });

  it("caps the list at 8 items", () => {
    for (let i = 0; i < 12; i++) {
      get().addRecentPlay(make(`p${i}`));
    }
    expect(get().recentPlays).toHaveLength(8);
    expect(get().recentPlays[0].id).toBe("p11");
  });

  it("pins favorites entry to the top when present", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().addRecentPlay(favorites);
    expect(get().recentPlays[0].id).toBe("favorites");
  });
});

describe("recentPlays store - insertRecentPlayAtTop", () => {
  it("moves an existing entry to the top", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().insertRecentPlayAtTop(make("a"));
    expect(get().recentPlays.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("inserts a new entry at the top", () => {
    get().addRecentPlay(make("a"));
    get().insertRecentPlayAtTop(make("z"));
    expect(get().recentPlays[0].id).toBe("z");
  });

  it("re-pins favorites to top after insert", () => {
    get().insertRecentPlayAtTop(favorites);
    get().insertRecentPlayAtTop(make("a"));
    // favorites must remain pinned even though "a" was inserted on top
    expect(get().recentPlays[0].id).toBe("favorites");
  });
});

describe("recentPlays store - clearRecentPlays", () => {
  it("clears everything except favorites", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(favorites);
    get().addRecentPlay(make("b"));
    get().clearRecentPlays();
    expect(get().recentPlays.map((p) => p.id)).toEqual(["favorites"]);
  });

  it("returns empty when favorites was never added", () => {
    get().addRecentPlay(make("a"));
    get().clearRecentPlays();
    expect(get().recentPlays).toEqual([]);
  });
});
