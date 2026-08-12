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
  currentAuthScope: () => "scope",
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import type { LrclibRecord } from "@/services/lrclib/types";
import useLrclibPicks from "@/stores/lrclibPicks";

const get = () => useLrclibPicks.getState();

const record = (id: number): LrclibRecord => ({
  id,
  trackName: `Track ${id}`,
  artistName: "Artist",
  albumName: "Album",
  duration: 200,
  syncedLyrics: "[00:01.00]words",
  plainLyrics: "words",
});

beforeEach(() => {
  useLrclibPicks.setState({ picks: {} });
});

describe("lrclib picks store", () => {
  test("setPick stores the record's lyrics alongside its metadata", () => {
    get().setPick("t1", record(7));
    expect(get().picks.t1).toMatchObject({
      id: 7,
      trackName: "Track 7",
      artistName: "Artist",
      albumName: "Album",
      duration: 200,
      syncedLyrics: "[00:01.00]words",
      plainLyrics: "words",
    });
    expect(typeof get().picks.t1.pickedAt).toBe("number");
  });

  test("setPick replaces an earlier pick for the same track", () => {
    get().setPick("t1", record(7));
    get().setPick("t1", record(8));
    expect(Object.keys(get().picks)).toEqual(["t1"]);
    expect(get().picks.t1.id).toBe(8);
  });

  test("picks are isolated per track", () => {
    get().setPick("t1", record(1));
    get().setPick("t2", record(2));
    expect(get().picks.t1.id).toBe(1);
    expect(get().picks.t2.id).toBe(2);
  });

  test("clearPick removes the entry so the automatic match applies again", () => {
    get().setPick("t1", record(1));
    get().clearPick("t1");
    expect(get().picks.t1).toBeUndefined();
  });

  // Each entry carries a whole lyrics sheet, so the map can't grow forever.
  test("the oldest picks are evicted past the cap", () => {
    for (let i = 0; i < 320; i++) {
      useLrclibPicks.setState((state) => ({
        picks: {
          ...state.picks,
          [`old-${i}`]: {
            ...record(i),
            pickedAt: i,
          },
        },
      }));
    }
    get().setPick("fresh", record(999));

    const picks = get().picks;
    expect(Object.keys(picks)).toHaveLength(300);
    expect(picks.fresh).toBeDefined();
    // Lowest pickedAt goes first.
    expect(picks["old-0"]).toBeUndefined();
    expect(picks["old-319"]).toBeDefined();
  });

  test("__reset clears every pick", () => {
    get().setPick("t1", record(1));
    get().__reset();
    expect(get().picks).toEqual({});
  });
});
