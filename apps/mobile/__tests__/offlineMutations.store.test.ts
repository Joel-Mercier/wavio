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

import useOfflineMutations, {
  applyEnqueue,
  type OfflineAction,
  playlistIdOf,
  type QueuedMutation,
} from "@/stores/offlineMutations";

let counter = 0;
const makeItem = (action: OfflineAction): QueuedMutation => ({
  id: `item-${counter++}`,
  createdAt: counter,
  retryCount: 0,
  status: "pending",
  action,
});

const enqueueAll = (actions: OfflineAction[]): QueuedMutation[] =>
  actions.reduce<QueuedMutation[]>(
    (queue, action) => applyEnqueue(queue, action, makeItem),
    [],
  );

const starSong = (id: string, starred: boolean): OfflineAction => ({
  type: "star",
  target: { kind: "song", id },
  starred,
});

const starAlbum = (id: string, starred: boolean): OfflineAction => ({
  type: "star",
  target: { kind: "album", id },
  starred,
});

const get = () => useOfflineMutations.getState();

beforeEach(() => {
  counter = 0;
  useOfflineMutations.setState({ queue: [] });
});

describe("applyEnqueue - star dedupe", () => {
  test("star then unstar same target cancels out", () => {
    const queue = enqueueAll([starAlbum("a1", true), starAlbum("a1", false)]);
    expect(queue).toHaveLength(0);
  });

  test("star, unstar, star nets a single star", () => {
    const queue = enqueueAll([
      starSong("s1", true),
      starSong("s1", false),
      starSong("s1", true),
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual(starSong("s1", true));
  });

  test("repeated star with same value is a no-op", () => {
    const queue = enqueueAll([starSong("s1", true), starSong("s1", true)]);
    expect(queue).toHaveLength(1);
  });

  test("same id but different kind does not cancel", () => {
    const queue = enqueueAll([starSong("x", true), starAlbum("x", false)]);
    expect(queue).toHaveLength(2);
  });

  test("artist star/unstar cancels out", () => {
    const queue = enqueueAll([
      { type: "star", target: { kind: "artist", id: "ar1" }, starred: true },
      { type: "star", target: { kind: "artist", id: "ar1" }, starred: false },
    ]);
    expect(queue).toHaveLength(0);
  });
});

describe("applyEnqueue - setRating dedupe", () => {
  test("latest rating wins in place", () => {
    const queue = enqueueAll([
      { type: "setRating", id: "s1", rating: 3 },
      starSong("s2", true),
      { type: "setRating", id: "s1", rating: 5 },
    ]);
    expect(queue).toHaveLength(2);
    expect(queue[0].action).toEqual({ type: "setRating", id: "s1", rating: 5 });
  });

  test("rating 0 replaces a queued rating", () => {
    const queue = enqueueAll([
      { type: "setRating", id: "s1", rating: 4 },
      { type: "setRating", id: "s1", rating: 0 },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual({ type: "setRating", id: "s1", rating: 0 });
  });
});

describe("applyEnqueue - playlist adds", () => {
  test("adjacent adds for the same playlist merge", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["b", "c"] },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual({
      type: "playlistAddSongs",
      playlistId: "p1",
      songIds: ["a", "b", "c"],
    });
  });

  test("adds for different playlists stay separate", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistAddSongs", playlistId: "p2", songIds: ["b"] },
    ]);
    expect(queue).toHaveLength(2);
  });

  test("an intervening remove is a merge barrier", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["x"] },
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["b"] },
    ]);
    expect(queue).toHaveLength(3);
    expect(queue.map((item) => item.action.type)).toEqual([
      "playlistAddSongs",
      "playlistRemoveSongs",
      "playlistAddSongs",
    ]);
  });
});

describe("applyEnqueue - playlist removes", () => {
  test("remove cancels a queued add of the same song", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["a"] },
    ]);
    expect(queue).toHaveLength(0);
  });

  test("partial cancel keeps the remaining added songs", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a", "b"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["a"] },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual({
      type: "playlistAddSongs",
      playlistId: "p1",
      songIds: ["b"],
    });
  });

  test("remove of a server-side song is queued and merges with adjacent removes", () => {
    const queue = enqueueAll([
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["x"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["y"] },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual({
      type: "playlistRemoveSongs",
      playlistId: "p1",
      songIds: ["x", "y"],
    });
  });

  test("remove-then-add of the same song stays as two ordered actions", () => {
    const queue = enqueueAll([
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
    ]);
    expect(queue).toHaveLength(2);
    expect(queue[0].action.type).toBe("playlistRemoveSongs");
    expect(queue[1].action.type).toBe("playlistAddSongs");
  });

  test("remove cancels the newest matching add first", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["x"] },
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["a"] },
    ]);
    expect(queue).toHaveLength(2);
    expect(queue[0].action).toEqual({
      type: "playlistAddSongs",
      playlistId: "p1",
      songIds: ["a"],
    });
    expect(queue[1].action).toEqual({
      type: "playlistRemoveSongs",
      playlistId: "p1",
      songIds: ["x"],
    });
  });

  test("removes only cancel adds of the same playlist", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistRemoveSongs", playlistId: "p2", songIds: ["a"] },
    ]);
    expect(queue).toHaveLength(2);
  });
});

describe("applyEnqueue - playlist edit", () => {
  test("edits for the same playlist merge with later fields winning", () => {
    const queue = enqueueAll([
      { type: "playlistEdit", playlistId: "p1", name: "First" },
      { type: "playlistEdit", playlistId: "p1", isPublic: true },
      { type: "playlistEdit", playlistId: "p1", name: "Second" },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toEqual({
      type: "playlistEdit",
      playlistId: "p1",
      name: "Second",
      isPublic: true,
    });
  });

  test("edit merges even across entry operations", () => {
    const queue = enqueueAll([
      { type: "playlistEdit", playlistId: "p1", name: "First" },
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistEdit", playlistId: "p1", comment: "hi" },
    ]);
    expect(queue).toHaveLength(2);
    expect(queue[0].action).toEqual({
      type: "playlistEdit",
      playlistId: "p1",
      name: "First",
      comment: "hi",
    });
  });
});

describe("applyEnqueue - playlist delete", () => {
  test("delete purges all queued actions for that playlist", () => {
    const queue = enqueueAll([
      { type: "playlistAddSongs", playlistId: "p1", songIds: ["a"] },
      { type: "playlistEdit", playlistId: "p1", name: "X" },
      { type: "playlistRemoveSongs", playlistId: "p1", songIds: ["y"] },
      { type: "playlistAddSongs", playlistId: "p2", songIds: ["b"] },
      { type: "playlistDelete", playlistId: "p1" },
    ]);
    expect(queue).toHaveLength(2);
    expect(playlistIdOf(queue[0].action)).toBe("p2");
    expect(queue[1].action).toEqual({
      type: "playlistDelete",
      playlistId: "p1",
    });
  });

  test("delete does not touch star or rating actions", () => {
    const queue = enqueueAll([
      starSong("s1", true),
      { type: "setRating", id: "s2", rating: 4 },
      { type: "playlistDelete", playlistId: "p1" },
    ]);
    expect(queue).toHaveLength(3);
  });
});

describe("offlineMutations store", () => {
  test("enqueue attaches label and metadata", () => {
    get().enqueue(starSong("s1", true), "My Song");
    const [item] = get().queue;
    expect(item.label).toBe("My Song");
    expect(item.retryCount).toBe(0);
    expect(item.status).toBe("pending");
    expect(item.action).toEqual(starSong("s1", true));
  });

  test("enqueue dedupes through applyEnqueue", () => {
    get().enqueue(starSong("s1", true));
    get().enqueue(starSong("s1", false));
    expect(get().queue).toHaveLength(0);
  });

  test("remove drops the given ids", () => {
    get().enqueue(starSong("s1", true));
    get().enqueue(starSong("s2", true));
    const ids = get().queue.map((item) => item.id);
    get().remove([ids[0]]);
    expect(get().queue).toHaveLength(1);
    expect(get().queue[0].id).toBe(ids[1]);
  });

  test("bumpRetry increments and resets status to pending", () => {
    get().enqueue(starSong("s1", true));
    const id = get().queue[0].id;
    get().setStatus(id, "inFlight");
    expect(get().queue[0].status).toBe("inFlight");
    get().bumpRetry(id);
    expect(get().queue[0].retryCount).toBe(1);
    expect(get().queue[0].status).toBe("pending");
  });

  test("removeForPlaylist drops every action for that playlist", () => {
    get().enqueue({
      type: "playlistAddSongs",
      playlistId: "p1",
      songIds: ["a"],
    });
    get().enqueue({ type: "playlistEdit", playlistId: "p1", name: "X" });
    get().enqueue(starSong("s1", true));
    get().removeForPlaylist("p1");
    expect(get().queue).toHaveLength(1);
    expect(get().queue[0].action.type).toBe("star");
  });

  test("clear and __reset empty the queue", () => {
    get().enqueue(starSong("s1", true));
    get().clear();
    expect(get().queue).toHaveLength(0);
    get().enqueue(starSong("s2", true));
    get().__reset();
    expect(get().queue).toHaveLength(0);
  });
});
