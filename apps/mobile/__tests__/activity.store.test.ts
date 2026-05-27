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

import useActivity from "@/stores/activity";

const get = () => useActivity.getState();

beforeEach(() => {
  useActivity.setState({ activity: [] }, false);
});

describe("activity store", () => {
  it("recordActivity prepends entry with playedAt timestamp", () => {
    const before = Date.now();
    get().recordActivity({ id: "a1", title: "Album", type: "album" });
    const e = get().activity[0];
    expect(e.id).toBe("a1");
    expect(e.playedAt).toBeGreaterThanOrEqual(before);
  });

  it("dedupes by (id, type) keeping the most recent", () => {
    get().recordActivity({ id: "a1", title: "Old", type: "album" });
    get().recordActivity({ id: "x1", title: "Other", type: "artist" });
    get().recordActivity({ id: "a1", title: "New", type: "album" });
    const items = get().activity;
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("New");
    expect(items[0].id).toBe("a1");
  });

  it("treats different types with same id as distinct entries", () => {
    get().recordActivity({ id: "shared", title: "Album", type: "album" });
    get().recordActivity({ id: "shared", title: "Artist", type: "artist" });
    expect(get().activity).toHaveLength(2);
  });

  it("caps stored entries at 100", () => {
    for (let i = 0; i < 110; i++) {
      get().recordActivity({
        id: `a${i}`,
        title: `t${i}`,
        type: "album",
      });
    }
    expect(get().activity).toHaveLength(100);
    // newest entry is a109
    expect(get().activity[0].id).toBe("a109");
  });

  it("clearActivity empties the list", () => {
    get().recordActivity({ id: "a1", title: "A", type: "album" });
    get().clearActivity();
    expect(get().activity).toEqual([]);
  });
});
