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
  usePlaylists.setState({ playlistSorts: {}, playlistTrackOrders: {} }, false);
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
