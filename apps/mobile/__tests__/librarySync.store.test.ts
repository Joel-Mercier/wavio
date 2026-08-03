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
  currentAuthScope: () => "scope",
}));

import useLibrarySync from "@/stores/librarySync";

const get = () => useLibrarySync.getState();

beforeEach(() => {
  get().__reset();
});

describe("librarySync store", () => {
  it("starts disabled and idle", () => {
    expect(get().extendedOfflineModeEnabled).toBe(false);
    expect(get().phase).toBe("idle");
    expect(get().albumOffset).toBe(0);
    expect(get().songOffset).toBe(0);
    expect(get().totalSongs).toBe(0);
    expect(get().processedSongs).toBe(0);
    expect(get().lastSyncCompletedAt).toBeNull();
    expect(get().lastError).toBeNull();
  });

  it("setCrawl merges partial cursor updates", () => {
    get().setCrawl({ phase: "albums", albumOffset: 500, totalSongs: 4200 });
    expect(get().phase).toBe("albums");
    expect(get().albumOffset).toBe(500);
    expect(get().totalSongs).toBe(4200);
    get().setCrawl({ phase: "songs", songOffset: 200 });
    expect(get().albumOffset).toBe(500);
    expect(get().songOffset).toBe(200);
  });

  it("resetCursor rewinds the crawl but keeps lastSyncCompletedAt", () => {
    get().setExtendedOfflineModeEnabled(true);
    get().setCrawl({
      phase: "complete",
      albumOffset: 1000,
      songOffset: 5000,
      totalSongs: 5000,
      processedSongs: 5000,
      lastSyncCompletedAt: "2026-07-16T00:00:00.000Z",
      lastError: "syncFailed",
    });
    get().resetCursor();
    expect(get().extendedOfflineModeEnabled).toBe(true);
    expect(get().phase).toBe("idle");
    expect(get().albumOffset).toBe(0);
    expect(get().songOffset).toBe(0);
    expect(get().totalSongs).toBe(0);
    expect(get().processedSongs).toBe(0);
    expect(get().lastError).toBeNull();
    expect(get().lastSyncCompletedAt).toBe("2026-07-16T00:00:00.000Z");
  });

  it("appendSeenIds accumulates per kind", () => {
    get().appendSeenIds("album", ["a1", "a2"]);
    get().appendSeenIds("album", ["a3"]);
    get().appendSeenIds("song", ["s1"]);
    get().appendSeenIds("playlist", ["p1"]);
    expect(get().seenAlbumIds).toEqual(["a1", "a2", "a3"]);
    expect(get().seenSongIds).toEqual(["s1"]);
    expect(get().seenPlaylistIds).toEqual(["p1"]);
  });

  it("resetCursor clears the seen inventory", () => {
    get().appendSeenIds("album", ["a1"]);
    get().appendSeenIds("song", ["s1"]);
    get().resetCursor();
    expect(get().seenAlbumIds).toEqual([]);
    expect(get().seenSongIds).toEqual([]);
    expect(get().seenPlaylistIds).toEqual([]);
  });

  // The calibration describes the server, not the pass. Rewinding it between
  // passes would send the completeness check back to the inflated album
  // bootstrap every time, which is the whole bug it exists to fix.
  it("resetCursor keeps the song-enumeration calibration", () => {
    get().setCalibration({
      enumerableSongCount: 62,
      calibratedAlbumSongEstimate: 75,
      lastPassSongCount: 62,
    });
    get().resetCursor();
    expect(get().enumerableSongCount).toBe(62);
    expect(get().calibratedAlbumSongEstimate).toBe(75);
    expect(get().lastPassSongCount).toBe(62);
  });

  it("__reset clears everything including the toggle", () => {
    get().setExtendedOfflineModeEnabled(true);
    get().setCrawl({
      phase: "songs",
      songOffset: 400,
      lastSyncCompletedAt: "2026-07-16T00:00:00.000Z",
    });
    // A calibration belongs to one server; a scope switch must not carry it
    // over to the next.
    get().setCalibration({
      enumerableSongCount: 62,
      calibratedAlbumSongEstimate: 75,
      lastPassSongCount: 62,
    });
    get().__reset();
    expect(get().extendedOfflineModeEnabled).toBe(false);
    expect(get().phase).toBe("idle");
    expect(get().songOffset).toBe(0);
    expect(get().lastSyncCompletedAt).toBeNull();
    expect(get().enumerableSongCount).toBeNull();
    expect(get().calibratedAlbumSongEstimate).toBeNull();
    expect(get().lastPassSongCount).toBeNull();
  });
});
