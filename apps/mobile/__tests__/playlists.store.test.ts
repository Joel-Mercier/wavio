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

import usePlaylists from "@/stores/playlists";

const get = () => usePlaylists.getState();

beforeEach(() => {
  usePlaylists.setState(
    { playlistSorts: {}, playlistTrackOrders: {}, smartPlaylistSnapshots: {} },
    false,
  );
});

describe("playlists store - sort", () => {
  it("getPlaylistSort defaults to addedAtAsc", () => {
    expect(get().getPlaylistSort("p1")).toBe("addedAtAsc");
  });

  it("setPlaylistSort persists per playlist", () => {
    get().setPlaylistSort("p1", "alphabeticalDesc");
    get().setPlaylistSort("p2", "addedAtDesc");
    expect(get().getPlaylistSort("p1")).toBe("alphabeticalDesc");
    expect(get().getPlaylistSort("p2")).toBe("addedAtDesc");
  });
});

describe("playlists store - track order", () => {
  it("setPlaylistTrackOrder replaces the order for the playlist", () => {
    get().setPlaylistTrackOrder("p1", ["t1", "t2"]);
    expect(get().getPlaylistTrackOrder("p1")).toEqual(["t1", "t2"]);
    get().setPlaylistTrackOrder("p1", ["t3"]);
    expect(get().getPlaylistTrackOrder("p1")).toEqual(["t3"]);
  });

  it("preserves duplicate track ids in the saved order", () => {
    get().setPlaylistTrackOrder("p1", ["t1", "t2", "t1"]);
    expect(get().getPlaylistTrackOrder("p1")).toEqual(["t1", "t2", "t1"]);
  });

  it("getPlaylistTrackOrder returns undefined for an unknown playlist", () => {
    expect(get().getPlaylistTrackOrder("missing")).toBeUndefined();
  });

  it("clearPlaylistTrackOrder only removes the targeted playlist", () => {
    get().setPlaylistTrackOrder("p1", ["t1"]);
    get().setPlaylistTrackOrder("p2", ["t2"]);
    get().clearPlaylistTrackOrder("p1");
    expect(get().getPlaylistTrackOrder("p1")).toBeUndefined();
    expect(get().getPlaylistTrackOrder("p2")).toEqual(["t2"]);
  });
});

describe("playlists store - smart playlist snapshots", () => {
  it("links a smart playlist to its static copy", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    expect(get().smartPlaylistSnapshots).toEqual({ smart: "snap" });
  });

  it("repoints an existing link instead of accumulating copies", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().setSmartPlaylistSnapshot("smart", "snap2");
    expect(get().smartPlaylistSnapshots).toEqual({ smart: "snap2" });
  });

  // Either end of the link can be the playlist that went away.
  it("drops the link when the smart playlist is forgotten", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().clearPlaylistPreferences("smart");
    expect(get().smartPlaylistSnapshots).toEqual({});
  });

  it("drops the link when the static copy is forgotten", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().clearPlaylistPreferences("snap");
    expect(get().smartPlaylistSnapshots).toEqual({});
  });

  it("leaves unrelated links alone", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().setSmartPlaylistSnapshot("other", "otherSnap");
    get().clearPlaylistPreferences("smart");
    expect(get().smartPlaylistSnapshots).toEqual({ other: "otherSnap" });
  });

  it("clears a single link explicitly", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().clearSmartPlaylistSnapshot("smart");
    expect(get().smartPlaylistSnapshots).toEqual({});
  });

  // The snapshot side is addressed by value, not by key, and two smart
  // playlists can legitimately point at the same static copy.
  it("clears every link pointing at a given static copy", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    get().setSmartPlaylistSnapshot("smart2", "snap");
    get().setSmartPlaylistSnapshot("other", "otherSnap");
    get().clearSnapshotLinksTo("snap");
    expect(get().smartPlaylistSnapshots).toEqual({ other: "otherSnap" });
  });

  it("leaves the map untouched when nothing points at the id", () => {
    get().setSmartPlaylistSnapshot("smart", "snap");
    const before = get().smartPlaylistSnapshots;
    get().clearSnapshotLinksTo("smart");
    expect(get().smartPlaylistSnapshots).toBe(before);
  });
});
