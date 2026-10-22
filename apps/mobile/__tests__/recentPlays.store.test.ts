const mockWrites: string[] = [];

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => {
      mockWrites.push(k);
      return mem.set(k, v);
    },
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

import useRecentPlays, {
  type RecentPlay,
  setFavoritesPinned,
} from "@/stores/recentPlays";

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
  setFavoritesPinned(true);
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

  it("caps the list at 20 items", () => {
    for (let i = 0; i < 24; i++) {
      get().addRecentPlay(make(`p${i}`));
    }
    expect(get().recentPlays).toHaveLength(20);
    expect(get().recentPlays[0].id).toBe("p23");
  });

  // persist wraps set() so that it writes the whole list back to storage on
  // every call, even one zustand treats as a no-op — so the early return in
  // addRecentPlay has to happen before set(), not inside it.
  it("does not write to storage when re-adding an existing entry", () => {
    get().addRecentPlay(make("a"));
    const writes = mockWrites.length;
    get().addRecentPlay(make("a"));
    expect(mockWrites).toHaveLength(writes);
    get().addRecentPlay(make("b"));
    expect(mockWrites.length).toBeGreaterThan(writes);
  });

  it("does not notify subscribers when re-adding an existing entry", () => {
    get().addRecentPlay(make("a"));
    const listener = jest.fn();
    const unsubscribe = useRecentPlays.subscribe(listener);
    get().addRecentPlay(make("a"));
    expect(listener).not.toHaveBeenCalled();
    get().addRecentPlay(make("b"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("refreshes metadata of an existing entry without reordering", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().addRecentPlay({
      id: "a",
      title: "renamed",
      type: "album",
      coverArt: "cover-2",
    });
    expect(get().recentPlays.map((p) => p.id)).toEqual(["b", "a"]);
    const refreshed = get().recentPlays.find((p) => p.id === "a");
    expect(refreshed?.title).toBe("renamed");
    expect(refreshed?.coverArt).toBe("cover-2");
  });

  // A radio station's artwork is scraped from its homepage, so playing it again
  // before that resolves passes coverArt: undefined — which must not blank the
  // shortcut (and the widget row) that already has it.
  it("keeps stored metadata the caller left undefined", () => {
    get().addRecentPlay({ ...make("a"), coverArt: "cover-1" });
    const writes = mockWrites.length;
    get().addRecentPlay({ ...make("a"), coverArt: undefined });
    expect(get().recentPlays.find((p) => p.id === "a")?.coverArt).toBe(
      "cover-1",
    );
    expect(mockWrites).toHaveLength(writes);
  });

  it("pins favorites entry to the top when present", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().addRecentPlay(favorites);
    expect(get().recentPlays[0].id).toBe("favorites");
  });

  it("orders favorites like any other entry when unpinned", () => {
    setFavoritesPinned(false);
    get().addRecentPlay(favorites);
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    expect(get().recentPlays.map((p) => p.id)).toEqual(["b", "a", "favorites"]);
  });

  it("lets an unpinned favorites entry fall past the cap", () => {
    setFavoritesPinned(false);
    get().addRecentPlay(favorites);
    for (let i = 0; i < 20; i++) {
      get().addRecentPlay(make(`p${i}`));
    }
    expect(get().recentPlays.find((p) => p.id === "favorites")).toBeUndefined();
  });
});

describe("recentPlays store - pinFavorites", () => {
  it("is a no-op before hydration", () => {
    get().addRecentPlay(make("a"));
    get().pinFavorites();
    expect(get().recentPlays.map((p) => p.id)).toEqual(["a"]);
  });

  describe("once hydrated", () => {
    beforeEach(async () => {
      await useRecentPlays.persist.rehydrate();
      useRecentPlays.setState({ recentPlays: [] }, false);
    });

    it("moves an existing favorites entry to the top", () => {
      setFavoritesPinned(false);
      get().addRecentPlay(favorites);
      get().addRecentPlay(make("a"));
      setFavoritesPinned(true);
      get().pinFavorites();
      expect(get().recentPlays.map((p) => p.id)).toEqual(["favorites", "a"]);
    });

    it("inserts favorites at the top when missing", () => {
      get().addRecentPlay(make("a"));
      get().pinFavorites();
      expect(get().recentPlays.map((p) => p.id)).toEqual(["favorites", "a"]);
    });

    it("does not write when favorites already leads", () => {
      get().addRecentPlay(make("a"));
      get().addRecentPlay(favorites);
      const writes = mockWrites.length;
      get().pinFavorites();
      expect(mockWrites).toHaveLength(writes);
    });
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

describe("recentPlays store - refreshRecentPlay", () => {
  it("updates an existing entry in place", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().refreshRecentPlay({
      id: "a",
      title: "renamed",
      type: "album",
      coverArt: "cover-2",
    });
    expect(get().recentPlays.map((p) => p.id)).toEqual(["b", "a"]);
    expect(get().recentPlays[1]).toMatchObject({
      title: "renamed",
      coverArt: "cover-2",
    });
  });

  // Browsing an item that isn't a shortcut must not turn it into one.
  it("does not add an entry that is not already there", () => {
    get().addRecentPlay(make("a"));
    const writes = mockWrites.length;
    get().refreshRecentPlay(make("z"));
    expect(get().recentPlays.map((p) => p.id)).toEqual(["a"]);
    expect(mockWrites).toHaveLength(writes);
  });

  it("does not write to storage when the metadata is unchanged", () => {
    get().addRecentPlay(make("a"));
    const writes = mockWrites.length;
    get().refreshRecentPlay(make("a"));
    expect(mockWrites).toHaveLength(writes);
  });
});

describe("recentPlays store - removeRecentPlay", () => {
  it("removes the matching entry and keeps the rest in order", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(make("b"));
    get().addRecentPlay(make("c"));
    get().removeRecentPlay("b");
    expect(get().recentPlays.map((p) => p.id)).toEqual(["c", "a"]);
  });

  // Same reason as addRecentPlay: a set() that changes nothing still rewrites
  // storage and wakes the widget / Android Auto subscribers.
  it("does not write to storage for an unknown id", () => {
    get().addRecentPlay(make("a"));
    const writes = mockWrites.length;
    get().removeRecentPlay("nope");
    expect(mockWrites).toHaveLength(writes);
    get().removeRecentPlay("a");
    expect(mockWrites.length).toBeGreaterThan(writes);
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

  it("clears favorites too when unpinned", () => {
    get().addRecentPlay(make("a"));
    get().addRecentPlay(favorites);
    setFavoritesPinned(false);
    get().clearRecentPlays();
    expect(get().recentPlays).toEqual([]);
  });
});

describe("recentPlays store - pin then cap ordering", () => {
  it("keeps a pinned favorites entry that sits past the cap", () => {
    const seeded: RecentPlay[] = [
      ...Array.from({ length: 21 }, (_, i) => make(`p${i}`)),
      favorites,
    ];
    useRecentPlays.setState({ recentPlays: seeded }, false);
    get().addRecentPlay(make("new"));
    expect(get().recentPlays).toHaveLength(20);
    expect(get().recentPlays[0].id).toBe("favorites");
  });
});

describe("recentPlays store - hydration", () => {
  it("rehydrate inserts favorites if missing while pinned", async () => {
    useRecentPlays.setState({ recentPlays: [make("a"), make("b")] }, false);
    await useRecentPlays.persist.rehydrate();
    // After rehydration the persisted state (just our seeded values) is loaded
    // and the onRehydrateStorage callback ensures favorites is pinned to the top.
    expect(get().recentPlays[0].id).toBe("favorites");
  });

  it("skips the auto-insert when unpinned", async () => {
    setFavoritesPinned(false);
    useRecentPlays.setState({ recentPlays: [make("a")] }, false);
    await useRecentPlays.persist.rehydrate();
    expect(get().recentPlays.find((p) => p.id === "favorites")).toBeUndefined();
  });

  it("moves favorites to the top when the scope left it lower", async () => {
    useRecentPlays.setState(
      { recentPlays: [make("a"), favorites, make("b")] },
      false,
    );
    await useRecentPlays.persist.rehydrate();
    expect(get().recentPlays.map((p) => p.id)).toEqual(["favorites", "a", "b"]);
  });

  it("does not duplicate when favorites is already present", async () => {
    useRecentPlays.setState({ recentPlays: [favorites, make("a")] }, false);
    await useRecentPlays.persist.rehydrate();
    const ids = get().recentPlays.map((p) => p.id);
    expect(ids.filter((id) => id === "favorites")).toHaveLength(1);
  });
});
