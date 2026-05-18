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
    { playlistSorts: {}, playlistTrackPositions: {} },
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

describe("playlists store - track positions", () => {
  it("setPlaylistTrackPositions replaces the whole map for the playlist", () => {
    get().setPlaylistTrackPositions("p1", { t1: 10, t2: 20 });
    expect(get().getPlaylistTrackPositions("p1")).toEqual({ t1: 10, t2: 20 });
    get().setPlaylistTrackPositions("p1", { t3: 30 });
    expect(get().getPlaylistTrackPositions("p1")).toEqual({ t3: 30 });
  });

  it("setTrackPosition merges into existing positions", () => {
    get().setTrackPosition("p1", "t1", 10);
    get().setTrackPosition("p1", "t2", 20);
    expect(get().getTrackPosition("p1", "t1")).toBe(10);
    expect(get().getTrackPosition("p1", "t2")).toBe(20);
  });

  it("setTrackPosition updates an existing track without affecting others", () => {
    get().setTrackPosition("p1", "t1", 10);
    get().setTrackPosition("p1", "t2", 20);
    get().setTrackPosition("p1", "t1", 99);
    expect(get().getTrackPosition("p1", "t1")).toBe(99);
    expect(get().getTrackPosition("p1", "t2")).toBe(20);
  });

  it("getTrackPosition returns undefined for unknown playlist or track", () => {
    expect(get().getTrackPosition("p1", "missing")).toBeUndefined();
    get().setTrackPosition("p1", "t1", 10);
    expect(get().getTrackPosition("p2", "t1")).toBeUndefined();
  });

  it("clearPlaylistTrackPositions only removes the targeted playlist", () => {
    get().setTrackPosition("p1", "t1", 10);
    get().setTrackPosition("p2", "t2", 20);
    get().clearPlaylistTrackPositions("p1");
    expect(get().getPlaylistTrackPositions("p1")).toBeUndefined();
    expect(get().getPlaylistTrackPositions("p2")).toEqual({ t2: 20 });
  });
});
