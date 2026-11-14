// The queue side of deleting files: a deleted current track can't be paused on
// the way a hidden one is, and what a refused delete takes out of the queue has
// to go back to where it was, with the deleted ones staying out.

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

jest.mock("@/services/player", () => ({
  pause: jest.fn(),
  moveToIndex: (index: number) =>
    jest
      .requireActual("@/stores/queue")
      .default.getState()
      .setCurrentIndex(index),
}));

import { pause } from "@/services/player";
import {
  removeFromQueueWhere,
  restoreSomeToQueue,
} from "@/services/queuePrune";
import useQueue from "@/stores/queue";

const track = (id: string) => ({ id, url: `u://${id}` });

const get = () => useQueue.getState();
const ids = () => get().queue.map((t) => t.id);
const current = () => get().getCurrent()?.id;
const matching =
  (...doomed: string[]) =>
  (t: { id: string }) =>
    doomed.includes(t.id);

beforeEach(() => {
  jest.clearAllMocks();
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: false,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
});

describe("removeFromQueueWhere", () => {
  test("keeps a current track nothing follows by default", () => {
    get().setQueue([track("a"), track("b")], 1);
    removeFromQueueWhere(matching("b"));
    expect(ids()).toEqual(["a", "b"]);
    expect(current()).toBe("b");
    expect(pause).toHaveBeenCalled();
  });

  test("empties the queue for a current track whose file is gone", () => {
    get().setQueue([track("a"), track("b"), track("c")], 2);
    const removed = removeFromQueueWhere(matching("a", "c"), {
      whenNothingFollows: "stop",
    });
    expect(pause).toHaveBeenCalled();
    expect(ids()).toEqual([]);
    expect(current()).toBeUndefined();
    expect(removed.map((r) => r.track.id)).toEqual(["a", "c"]);
  });

  test("still skips ahead when something follows", () => {
    get().setQueue([track("a"), track("b"), track("c")], 0);
    removeFromQueueWhere(matching("a"), { whenNothingFollows: "stop" });
    expect(ids()).toEqual(["b", "c"]);
    expect(current()).toBe("b");
    expect(pause).not.toHaveBeenCalled();
  });
});

describe("restoreSomeToQueue", () => {
  test("puts back only the kept entries, in their own slots", () => {
    get().setQueue(
      [track("a"), track("b"), track("c"), track("d"), track("e")],
      0,
    );
    const removed = removeFromQueueWhere(matching("b", "c", "d"));
    expect(ids()).toEqual(["a", "e"]);
    restoreSomeToQueue(removed, (t) => t.id === "d");
    expect(ids()).toEqual(["a", "d", "e"]);
    expect(current()).toBe("a");
  });

  test("returns a skipped current track to the history", () => {
    get().setQueue([track("a"), track("b"), track("c")], 1);
    const removed = removeFromQueueWhere(matching("a", "b"));
    expect(current()).toBe("c");
    restoreSomeToQueue(removed, (t) => t.id === "b");
    expect(ids()).toEqual(["b", "c"]);
    expect(current()).toBe("c");
  });
});
