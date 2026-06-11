// Mock MMKV-backed storage with an in-memory implementation
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

import useBookmarks from "@/stores/bookmarks";

const get = () => useBookmarks.getState();

beforeEach(() => {
  useBookmarks.setState({ bookmarks: {} });
});

describe("bookmarks store", () => {
  test("addBookmark stores a rounded position for a track", () => {
    get().addBookmark("t1", 12.6);
    expect(get().bookmarks.t1).toEqual([13]);
  });

  test("multiple bookmarks per track are kept sorted ascending", () => {
    get().addBookmark("t1", 132);
    get().addBookmark("t1", 12);
    get().addBookmark("t1", 60);
    expect(get().bookmarks.t1).toEqual([12, 60, 132]);
  });

  test("near-duplicate positions (within 1s) are ignored", () => {
    get().addBookmark("t1", 30);
    get().addBookmark("t1", 30.4);
    get().addBookmark("t1", 31);
    expect(get().bookmarks.t1).toEqual([30]);
  });

  test("bookmarks are isolated per track", () => {
    get().addBookmark("t1", 10);
    get().addBookmark("t2", 20);
    expect(get().bookmarks.t1).toEqual([10]);
    expect(get().bookmarks.t2).toEqual([20]);
  });

  test("removeBookmark drops the position and cleans up the empty key", () => {
    get().addBookmark("t1", 10);
    get().addBookmark("t1", 20);
    get().removeBookmark("t1", 10);
    expect(get().bookmarks.t1).toEqual([20]);
    get().removeBookmark("t1", 20);
    expect(get().bookmarks.t1).toBeUndefined();
  });

  test("clearTrackBookmarks removes all positions for a track", () => {
    get().addBookmark("t1", 10);
    get().addBookmark("t1", 20);
    get().clearTrackBookmarks("t1");
    expect(get().bookmarks.t1).toBeUndefined();
  });

  test("addBookmark caps the number of positions per track at 50", () => {
    for (let i = 0; i < 60; i++) {
      // 2s apart so they don't dedupe
      get().addBookmark("t1", i * 2);
    }
    expect(get().bookmarks.t1).toHaveLength(50);
  });

  test("__reset clears all bookmarks", () => {
    get().addBookmark("t1", 10);
    get().addBookmark("t2", 20);
    get().__reset();
    expect(get().bookmarks).toEqual({});
  });
});
