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

import usePlayHistory from "@/stores/playHistory";
import type { QueueTrack } from "@/stores/queue";

const track = (id: string, overrides: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id,
    url: `url://${id}`,
    title: `title-${id}`,
    artist: "artist",
    album: "album",
    duration: 200,
    ...overrides,
  }) as QueueTrack;

const get = () => usePlayHistory.getState();

beforeEach(() => {
  usePlayHistory.setState({ history: [] }, false);
});

describe("playHistory store", () => {
  it("recordPlay prepends a snapshot with a playedAt timestamp", () => {
    const before = Date.now();
    get().recordPlay(track("t1", { album: "Album name" }));
    const entry = get().history[0];
    expect(entry.id).toBe("t1");
    expect(entry.title).toBe("title-t1");
    expect(entry.album).toBe("Album name");
    expect(entry.playedAt).toBeGreaterThanOrEqual(before);
  });

  it("does not persist the stream url", () => {
    get().recordPlay(track("t1"));
    expect(get().history[0]).not.toHaveProperty("url");
  });

  it("dedupes by id, bumping the existing entry to the top", () => {
    get().recordPlay(track("t1"));
    get().recordPlay(track("t2"));
    get().recordPlay(track("t1", { title: "renamed" }));
    const items = get().history;
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("t1");
    expect(items[0].title).toBe("renamed");
    expect(items[1].id).toBe("t2");
  });

  it("caps stored entries at 100, dropping the oldest", () => {
    for (let i = 0; i < 110; i++) get().recordPlay(track(`t${i}`));
    const items = get().history;
    expect(items).toHaveLength(100);
    expect(items[0].id).toBe("t109");
    expect(items.some((entry) => entry.id === "t0")).toBe(false);
  });

  it("removeIds drops only the named entries", () => {
    get().recordPlay(track("t1"));
    get().recordPlay(track("t2"));
    get().recordPlay(track("t3"));
    get().removeIds(["t1", "t3"]);
    expect(get().history.map((entry) => entry.id)).toEqual(["t2"]);
  });

  it("removeIds is a no-op for an empty list", () => {
    get().recordPlay(track("t1"));
    const before = get().history;
    get().removeIds([]);
    expect(get().history).toBe(before);
  });

  it("markVerified stamps only the named entries", () => {
    get().recordPlay(track("t1"));
    get().recordPlay(track("t2"));
    get().markVerified(["t1"], 1234);
    const byId = Object.fromEntries(
      get().history.map((entry) => [entry.id, entry]),
    );
    expect(byId.t1.verifiedAt).toBe(1234);
    expect(byId.t2.verifiedAt).toBeUndefined();
  });

  it("a replay carries the previous verifiedAt rather than re-claiming one", () => {
    get().recordPlay(track("t1"));
    get().markVerified(["t1"], 1234);
    get().recordPlay(track("t1"));
    expect(get().history[0].verifiedAt).toBe(1234);
  });

  it("clearHistory and __reset empty the list", () => {
    get().recordPlay(track("t1"));
    get().clearHistory();
    expect(get().history).toEqual([]);
    get().recordPlay(track("t2"));
    get().__reset();
    expect(get().history).toEqual([]);
  });
});
