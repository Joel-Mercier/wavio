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

import useLocalLibrary from "@/stores/localLibrary";

const get = () => useLocalLibrary.getState();

beforeEach(() => {
  get().__reset();
});

describe("localLibrary store — ratings", () => {
  it("sets a rating keyed by id", () => {
    get().setRating("local-album:abc", 4);
    expect(get().ratings).toEqual({ "local-album:abc": 4 });
  });

  it("overwrites an existing rating for the same id", () => {
    get().setRating("local-track:x", 3);
    get().setRating("local-track:x", 5);
    expect(get().ratings["local-track:x"]).toBe(5);
  });

  it("clears a rating when set to 0 (Subsonic semantics)", () => {
    get().setRating("local-album:abc", 4);
    get().setRating("local-album:abc", 0);
    expect("local-album:abc" in get().ratings).toBe(false);
  });

  it("is a no-op clearing an id that was never rated", () => {
    get().setRating("local-album:missing", 0);
    expect(get().ratings).toEqual({});
  });

  it("keeps ratings independent across ids", () => {
    get().setRating("local-album:a", 2);
    get().setRating("local-album:b", 5);
    get().setRating("local-album:a", 0);
    expect(get().ratings).toEqual({ "local-album:b": 5 });
  });
});

describe("localLibrary store — favourites still work alongside ratings", () => {
  it("star and setRating coexist without clobbering each other", () => {
    get().star({ albumId: "local-album:a" });
    get().setRating("local-album:a", 4);
    expect(get().favoriteAlbums["local-album:a"]).toBeGreaterThan(0);
    expect(get().ratings["local-album:a"]).toBe(4);
  });
});

describe("localLibrary store — rescan control", () => {
  it("requestRescan clears the scan stamp and defaults to incremental", () => {
    get().setScanFinished({
      indexed: 1,
      skipped: 0,
      removed: 0,
      failed: 0,
      cancelled: false,
    });
    expect(get().lastScanAt).toBeDefined();
    get().requestRescan();
    expect(get().lastScanAt).toBeUndefined();
    expect(get().forceNextScan).toBe(false);
  });

  it("requestRescan(true) marks the next scan as forced", () => {
    get().requestRescan(true);
    expect(get().forceNextScan).toBe(true);
  });

  it("setScanFinished resets the force flag", () => {
    get().requestRescan(true);
    get().setScanFinished({
      indexed: 0,
      skipped: 0,
      removed: 0,
      failed: 0,
      cancelled: false,
    });
    expect(get().forceNextScan).toBe(false);
  });
});

describe("localLibrary store — clearLocalLibraryData (server deletion)", () => {
  it("wipes favourites, ratings and the scan stamp but keeps ready", () => {
    get().setReady();
    get().star({ id: "local-track:x" });
    get().star({ albumId: "local-album:a" });
    get().setRating("local-album:a", 4);
    get().setScanFinished({
      indexed: 2,
      skipped: 0,
      removed: 0,
      failed: 0,
      cancelled: false,
    });

    get().clearLocalLibraryData();

    expect(get().favoriteTracks).toEqual({});
    expect(get().favoriteAlbums).toEqual({});
    expect(get().ratings).toEqual({});
    expect(get().lastScanAt).toBeUndefined();
    expect(get().lastScanResult).toBeUndefined();
    expect(get().ready).toBe(true);
  });
});
