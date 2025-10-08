import useQueue from "@/stores/queue";

// Mock MMKV-backed storage with an in-memory implementation
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (key: string, value: string) => {
        mem.set(key, value);
      },
      getString: (key: string) => {
        return mem.get(key) ?? null;
      },
      delete: (key: string) => {
        mem.delete(key);
      },
    },
  };
});

type TestTrack = { id: string; url: string };

const makeTracks = (n: number, prefix = "t"): TestTrack[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    url: `url://${prefix}${i + 1}`,
  }));

const get = () => useQueue.getState();

beforeEach(() => {
  // Reset store state between tests
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: true,
    repeatMode: "off",
    contextIds: null,
    shuffle: false,
    shuffleOrderIds: null,
    shuffleCursor: null,
  });
});

describe("queue store - basic state setters", () => {
  test("setQueue initializes queue and currentIndex", () => {
    const tracks = makeTracks(3);
    get().setQueue(tracks, 1);
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(get().currentIndex).toBe(1);
  });

  test("clearQueue empties queue and resets index and context", () => {
    const tracks = makeTracks(2);
    get().setQueue(tracks, 0);
    get().setContext(["t1"]);
    get().clearQueue();
    expect(get().queue).toHaveLength(0);
    expect(get().currentIndex).toBeNull();
    expect(get().contextIds).toBeNull();
  });

  test("setCurrentIndex clamps within range", () => {
    const tracks = makeTracks(2);
    get().setQueue(tracks, 0);
    get().setCurrentIndex(10);
    expect(get().currentIndex).toBe(1);
    get().setCurrentIndex(-5);
    expect(get().currentIndex).toBe(0);
    get().setCurrentIndex(null);
    expect(get().currentIndex).toBeNull();
  });

  test("setRemovePlayed and setRepeatMode", () => {
    get().setRemovePlayed(false);
    expect(get().removePlayed).toBe(false);
    get().setRepeatMode("all");
    expect(get().repeatMode).toBe("all");
  });

  test("setContext filters to existing ids, clears when none valid", () => {
    const tracks = makeTracks(3);
    get().setQueue(tracks, 0);
    get().setContext(["t2", "x"]); // x not present
    expect(get().contextIds).toEqual(["t2"]);
    get().removeByIds(["t2"]);
    expect(get().contextIds).toBeNull();
  });
});

describe("queue store - shuffle mode", () => {
  test("enabling shuffle creates an order and cursor on current", () => {
    const base = makeTracks(5);
    get().setQueue(base, 2); // current t3
    expect(get().shuffle).toBeFalsy();
    get().setShuffle(true);
    expect(get().shuffle).toBeTruthy();
    expect(get().shuffleOrderIds).not.toBeNull();
    expect(get().shuffleOrderIds?.length).toBeGreaterThan(0);
    const currentId = get().getCurrent()?.id;
    expect(currentId).toBe("t3");
    const cursor = get().shuffleCursor;
    expect(cursor).not.toBeNull();
    expect(get().shuffleOrderIds?.[cursor as number]).toBe(currentId);
  });

  test("next respects shuffle order without removePlayed and wraps when repeat all", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setShuffle(true);
    const initialCursor = get().shuffleCursor as number;
    const initialOrder = get().shuffleOrderIds as string[];
    // Step through 4 times, expecting wrap on 3rd -> 0
    get().next();
    expect(get().shuffleCursor).toBe((initialCursor + 1) % initialOrder.length);
    get().next();
    expect(get().shuffleCursor).toBe((initialCursor + 2) % initialOrder.length);
    get().next();
    expect(get().shuffleCursor).toBe((initialCursor + 3) % initialOrder.length);
  });

  test("next in shuffle with removePlayed removes current and advances to next id", () => {
    const base = makeTracks(4);
    get().setQueue(base, 1); // t2 current
    get().setRemovePlayed(true);
    get().setShuffle(true);
    const orderBefore = get().shuffleOrderIds as string[];
    const expectedNextId = orderBefore.filter((id) => id !== "t2")[0];
    get().next();
    expect(get().queue.map((t) => t.id)).toHaveLength(3);
    expect(get().getCurrent()?.id).toBe(expectedNextId);
    // cursor should be at 0 after removal path
    expect(get().shuffleCursor).toBe(0);
  });

  test("previous in shuffle steps back by order and wraps with repeat all", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setShuffle(true);
    // Move forward once to avoid prev at start
    get().next();
    const curCursor = get().shuffleCursor as number;
    get().previous();
    const order = get().shuffleOrderIds as string[];
    const expectedCursor = (curCursor - 1 + order.length) % order.length;
    expect(get().shuffleCursor).toBe(expectedCursor);
  });

  test("setQueue while shuffle on rebuilds order and aligns cursor", () => {
    const base = makeTracks(3);
    get().setQueue(base, 1); // t2 current
    get().setShuffle(true);
    get().setQueue(makeTracks(2), 0); // now t1 current
    const currentId = get().getCurrent()?.id;
    expect(currentId).toBe("t1");
    const cursor = get().shuffleCursor as number;
    expect(get().shuffleOrderIds?.[cursor]).toBe(currentId);
  });
});

describe("queue store - enqueue and play", () => {
  test("enqueueNext inserts after current", () => {
    const base = makeTracks(3);
    get().setQueue(base, 1); // t2 current
    get().enqueueNext({ id: "x", url: "url://x" });
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t2", "x", "t3"]);
    expect(get().currentIndex).toBe(1);
  });

  test("enqueueEnd appends at the end", () => {
    const base = makeTracks(2);
    get().setQueue(base, 0);
    get().enqueueEnd([
      { id: "x", url: "url://x" },
      { id: "y", url: "url://y" },
    ]);
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t2", "x", "y"]);
  });

  test("playNow replaces queue and index, prunes context", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().setContext(["t2", "t3"]);
    get().playNow(
      [
        { id: "t3", url: "url://t3" },
        { id: "a", url: "url://a" },
      ],
      1,
    );
    expect(get().queue.map((t) => t.id)).toEqual(["t3", "a"]);
    expect(get().currentIndex).toBe(1);
    // Only t3 remains from old context, but it exists → kept
    expect(get().contextIds).toEqual(["t3"]);
  });
});

describe("queue store - removals and move", () => {
  test("removeByIds updates queue, index and context", () => {
    const base = makeTracks(4);
    get().setQueue(base, 2); // current t3
    get().setContext(["t2", "t4"]);
    get().removeByIds(["t1", "t2"]);
    expect(get().queue.map((t) => t.id)).toEqual(["t3", "t4"]);
    // Two removed before index 2 → index becomes 0 (t3)
    expect(get().currentIndex).toBe(0);
    // Context pruned (t2 removed)
    expect(get().contextIds).toEqual(["t4"]);
  });

  test("removeAtIndices updates queue, index and context", () => {
    const base = makeTracks(5);
    get().setQueue(base, 3); // current t4
    get().setContext(["t1", "t3", "t5"]);
    get().removeAtIndices([0, 2, 4]); // remove t1, t3, t5
    expect(get().queue.map((t) => t.id)).toEqual(["t2", "t4"]);
    // Removed one before current (t1, t3 are before t4) → index adjusts from 3 to 1
    expect(get().currentIndex).toBe(1);
    // Context pruned to none
    expect(get().contextIds).toBeNull();
  });

  test("move reorders queue and adjusts index", () => {
    const base = makeTracks(4);
    get().setQueue(base, 2); // current t3
    get().move(2, 0);
    expect(get().queue.map((t) => t.id)).toEqual(["t3", "t1", "t2", "t4"]);
    expect(get().currentIndex).toBe(0);
    get().move(3, 1);
    expect(get().queue.map((t) => t.id)).toEqual(["t3", "t4", "t1", "t2"]);
    // currentIndex 0 remains since move didn't target current
    expect(get().currentIndex).toBe(0);
  });
});

describe("queue store - getCurrent", () => {
  test("returns null when invalid index or empty", () => {
    expect(get().getCurrent()).toBeNull();
    const base = makeTracks(1);
    get().setQueue(base, 0);
    get().setCurrentIndex(5);
    // setCurrentIndex clamps to valid range, so current becomes index 0
    expect(get().currentIndex).toBe(0);
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t1");
  });

  test("returns current track when valid", () => {
    const base = makeTracks(2);
    get().setQueue(base, 1);
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t2");
  });
});

describe("queue store - navigation without context", () => {
  test("next with removePlayed=true shrinks queue and advances", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().setRemovePlayed(true);
    get().next(); // remove t1, now [t2, t3], index 0
    expect(get().queue.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(get().currentIndex).toBe(0);
  });

  test("next with removePlayed=false and repeat off stops at end", () => {
    const base = makeTracks(2);
    get().setQueue(base, 1);
    get().setRemovePlayed(false);
    get().setRepeatMode("off");
    get().next(); // at end → null
    expect(get().currentIndex).toBeNull();
  });

  test("previous with repeat off stops before start", () => {
    const base = makeTracks(2);
    get().setQueue(base, 0);
    get().setRepeatMode("off");
    get().previous();
    expect(get().currentIndex).toBeNull();
  });

  test("next with repeat all wraps to 0 (no remove)", () => {
    const base = makeTracks(3);
    get().setQueue(base, 2);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().next();
    expect(get().currentIndex).toBe(0);
  });

  test("previous with repeat all wraps to last (no remove)", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().previous();
    expect(get().currentIndex).toBe(2);
  });

  test("repeat one keeps current on next/previous", () => {
    const base = makeTracks(3);
    get().setQueue(base, 1);
    get().setRepeatMode("one");
    const idx = get().currentIndex;
    get().next();
    expect(get().currentIndex).toBe(idx);
    get().previous();
    expect(get().currentIndex).toBe(idx);
  });
});

describe("queue store - navigation with context (repeat all)", () => {
  test("next wraps within context ids only", () => {
    const base = makeTracks(5);
    get().setQueue(base, 1); // t2 current
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setContext(["t2", "t4"]);
    // From t2 → next context member is t4
    get().next();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t4");
    // Next after t4 wraps to t2
    get().next();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t2");
  });

  test("previous wraps within context ids only (backwards)", () => {
    const base = makeTracks(5);
    get().setQueue(base, 3); // t4 current
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setContext(["t1", "t3", "t4"]);
    // previous from t4 → t3
    get().previous();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t3");
    // previous from t3 → t1
    get().previous();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t1");
    // previous from t1 wraps to t4
    get().previous();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t4");
  });

  test("context skips ids not present in queue", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0); // t1 current
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setContext(["x", "t2"]);
    get().next();
    expect(get().getCurrent()).not.toBeNull();
    expect(get().getCurrent()?.id).toBe("t2");
  });

  test("removePlayed still removes track when repeat all but no context", () => {
    const base = makeTracks(2);
    get().setQueue(base, 0);
    get().setRemovePlayed(true);
    get().setRepeatMode("all");
    get().next(); // removes t1
    expect(get().queue.map((t) => t.id)).toEqual(["t2"]);
    expect(get().currentIndex).toBe(0);
  });
});
