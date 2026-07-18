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

import useActivity from "@/stores/activity";
import type { QueueSource, QueueTrack } from "@/stores/queue";

const get = () => useActivity.getState();

const track = (id: string, extra: Partial<QueueTrack> = {}): QueueTrack => ({
  id,
  url: `file://${id}`,
  title: `Title ${id}`,
  artist: "Artist",
  album: "Album",
  coverArt: `cover-${id}`,
  albumId: "al1",
  artistId: "ar1",
  ...extra,
});

const albumSource: QueueSource = {
  type: "album",
  id: "al1",
  name: "DAMN.",
  coverArt: "album-cover",
};

beforeEach(() => {
  useActivity.setState({ activity: [] }, false);
});

describe("activity store — recordPlay", () => {
  it("prepends a play carrying a normalized album/artist/playlist source", () => {
    get().recordPlay(track("t1"), albumSource);
    const e = get().activity[0];
    expect(e.trackId).toBe("t1");
    expect(e.source).toEqual({
      type: "album",
      id: "al1",
      name: "DAMN.",
      coverArt: "album-cover",
    });
    expect(e.playedAt).toBeGreaterThan(0);
  });

  it("treats non-groupable sources as generic (source = null)", () => {
    get().recordPlay(track("t1"), { type: "likedSongs", name: "Liked" });
    get().recordPlay(track("t2"), { type: "folder", name: "F", id: "f1" });
    // album source missing an id can't be routed → generic
    get().recordPlay(track("t3"), { type: "album", name: "No id" });
    for (const e of get().activity) {
      expect(e.source).toBeNull();
    }
  });

  it("refreshes timestamp instead of duplicating a repeat of the head track under the same source", () => {
    get().recordPlay(track("t1"), albumSource);
    const firstAt = get().activity[0].playedAt;
    get().recordPlay(track("t1"), albumSource);
    expect(get().activity).toHaveLength(1);
    expect(get().activity[0].playedAt).toBeGreaterThanOrEqual(firstAt);
  });

  it("keeps the same track as a new entry when the source differs", () => {
    get().recordPlay(track("t1"), albumSource);
    get().recordPlay(track("t1"), {
      type: "playlist",
      id: "p1",
      name: "Mix",
    });
    expect(get().activity).toHaveLength(2);
    expect(get().activity[0].source?.type).toBe("playlist");
  });

  it("caps stored entries at 200", () => {
    for (let i = 0; i < 210; i++) {
      get().recordPlay(track(`t${i}`), albumSource);
    }
    expect(get().activity).toHaveLength(200);
    expect(get().activity[0].trackId).toBe("t209");
  });

  it("clearActivity empties the list", () => {
    get().recordPlay(track("t1"), albumSource);
    get().clearActivity();
    expect(get().activity).toEqual([]);
  });

  it("migrate discards legacy (pre-v1) entries", () => {
    const migrate = useActivity.persist.getOptions().migrate;
    expect(migrate).toBeDefined();
    const migrated = migrate?.({ activity: [{ id: "legacy" }] }, 0);
    expect(migrated).toEqual({ activity: [] });
  });
});
