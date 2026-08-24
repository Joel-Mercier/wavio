const mockMem = new Map<string, string>();

jest.mock("@/config/storage", () => {
  const make = () => ({
    setItem: (k: string, v: string) => mockMem.set(k, v),
    getItem: (k: string) => mockMem.get(k) ?? null,
    removeItem: (k: string) => mockMem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mockMem.set(k, v),
      getString: (k: string) => mockMem.get(k) ?? null,
      remove: (k: string) => mockMem.delete(k),
      getAllKeys: () => [...mockMem.keys()],
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

const mockSession = { url: "u", username: "n", serverId: "active" };

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockSession },
  currentAuthScope: () => "active_n",
}));

import useLocalLibrary, { requestRescanForServer } from "@/stores/localLibrary";

const get = () => useLocalLibrary.getState();

beforeEach(() => {
  get().__reset();
  mockMem.clear();
  mockSession.serverId = "active";
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
      incomplete: false,
      unreadable: 0,
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
      incomplete: false,
      unreadable: 0,
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
      incomplete: false,
      unreadable: 0,
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

// Editing a saved server's folders/library path has to reconcile *that* library's
// index. The store is scope-bound, so the naive `requestRescan()` reconciled
// whichever library happened to be signed in instead — rescanning the wrong one
// and leaving the edited one serving files outside its new path.
describe("requestRescanForServer", () => {
  const blob = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      state: {
        lastScanAt: 1700000000000,
        lastScanResult: { added: 3 },
        favoriteTracks: { "local-track:a": 1 },
        ...extra,
      },
      version: 0,
    });

  const stampOf = (key: string) =>
    JSON.parse(mockMem.get(key) ?? "{}").state as Record<string, unknown>;

  it("clears the active library in memory when it is the edited one", () => {
    get().setScanFinished({ added: 1 } as never);
    expect(get().lastScanAt).toBeDefined();
    requestRescanForServer("active", "webdav");
    expect(get().lastScanAt).toBeUndefined();
    expect(get().forceNextScan).toBe(false);
  });

  it("clears another server's persisted stamp without touching the active one", () => {
    mockMem.set("other_n:localLibraryStore", blob());
    get().setScanFinished({ added: 1 } as never);

    requestRescanForServer("other", "webdav");

    // The gate tests for `lastScanAt === undefined`, which is what rehydrating a
    // blob missing the key produces — so the keys are deleted, not nulled.
    const state = stampOf("other_n:localLibraryStore");
    expect("lastScanAt" in state).toBe(false);
    expect("lastScanResult" in state).toBe(false);
    // Favourites live in the same blob and are not scan state.
    expect(state.favoriteTracks).toEqual({ "local-track:a": 1 });
    // The signed-in library is untouched.
    expect(get().lastScanAt).toBeDefined();
  });

  it("covers every user of the edited server", () => {
    mockMem.set("other_alice:localLibraryStore", blob());
    mockMem.set("other_bob:localLibraryStore", blob());
    mockMem.set("elsewhere_n:localLibraryStore", blob());

    requestRescanForServer("other", "webdav");

    expect("lastScanAt" in stampOf("other_alice:localLibraryStore")).toBe(
      false,
    );
    expect("lastScanAt" in stampOf("other_bob:localLibraryStore")).toBe(false);
    expect("lastScanAt" in stampOf("elsewhere_n:localLibraryStore")).toBe(true);
  });

  it("resolves the on-device library by its sentinel scope, not by id", () => {
    mockSession.serverId = "some-share";
    mockMem.set("local_local:localLibraryStore", blob());
    requestRescanForServer("the-local-row", "local");
    expect("lastScanAt" in stampOf("local_local:localLibraryStore")).toBe(
      false,
    );
  });

  it("is a no-op for a server that has never been signed into", () => {
    expect(() => requestRescanForServer("never", "smb")).not.toThrow();
    expect(mockMem.size).toBe(0);
  });
});
