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

import useQueue, { MAX_QUEUE_TRACKS, peekNextTrack } from "@/stores/queue";

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
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
});

// The queue is the playback order, so the ids it holds after any operation are
// what will actually play — asserting on them is asserting on playback.
const ids = () => get().queue.map((t) => t.id);

describe("queue store - basic state setters", () => {
  test("setQueue initializes queue and currentIndex", () => {
    const tracks = makeTracks(3);
    get().setQueue(tracks, 1);
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(get().currentIndex).toBe(1);
  });

  test("clearQueue empties queue and resets index and order", () => {
    const tracks = makeTracks(2);
    get().setQueue(tracks, 0);
    get().setShuffle(true);
    get().clearQueue();
    expect(get().queue).toHaveLength(0);
    expect(get().currentIndex).toBeNull();
    expect(get().originalOrderIds).toBeNull();
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
});

describe("queue store - playback source", () => {
  const albumSource = {
    type: "album" as const,
    name: "My Album",
    id: "a1",
  };

  test("setQueue stores the source", () => {
    get().setQueue(makeTracks(3), 0, albumSource);
    expect(get().source).toEqual(albumSource);
  });

  test("playNow stores the source", () => {
    get().playNow(makeTracks(2), 0, albumSource);
    expect(get().source).toEqual(albumSource);
  });

  test("source defaults to null when none is provided", () => {
    get().setQueue(makeTracks(2), 0, albumSource);
    get().playNow(makeTracks(2), 0); // no source argument
    expect(get().source).toBeNull();
  });

  test("setQueue without a source argument keeps the current one", () => {
    // The Queue screen's reorder replaces the queue in place; that must not
    // drop the "Playing from …" label.
    get().setQueue(makeTracks(3), 0, albumSource);
    get().setQueue([...makeTracks(3)].reverse(), 0);
    expect(get().source).toEqual(albumSource);
  });

  test("clearQueue clears the source", () => {
    get().setQueue(makeTracks(2), 0, albumSource);
    get().clearQueue();
    expect(get().source).toBeNull();
  });

  test("skipping tracks preserves the source", () => {
    get().setRemovePlayed(false);
    get().setQueue(makeTracks(3), 0, albumSource);
    get().next();
    get().next();
    get().previous();
    expect(get().source).toEqual(albumSource);
  });
});

describe("queue store - shuffle mode", () => {
  // Regression for #137: the Queue screen renders `queue` forward from
  // `currentIndex`, so whatever sits there must be exactly what plays next.
  test("what the queue shows below the current track is what next() plays", () => {
    get().setQueue(makeTracks(20), 0);
    get().setRemovePlayed(false);
    get().setShuffle(true);
    const upcoming = get()
      .queue.slice(1)
      .map((t) => t.id);
    const played: string[] = [];
    for (let i = 0; i < upcoming.length; i++) {
      get().next();
      played.push(get().getCurrent()?.id as string);
    }
    expect(played).toEqual(upcoming);
  });

  test("enabling shuffle permutes the queue and keeps the current track put", () => {
    get().setQueue(makeTracks(20), 4); // current t5
    expect(get().shuffle).toBeFalsy();
    get().setShuffle(true);
    expect(get().shuffle).toBeTruthy();
    expect(get().getCurrent()?.id).toBe("t5");
    expect(get().currentIndex).toBe(4);
    // The played head is untouched, the tail is randomised, nothing is lost.
    expect(ids().slice(0, 5)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(ids().slice(5)).not.toEqual(get().originalOrderIds?.slice(5));
    expect([...ids()].sort()).toEqual(
      [...(get().originalOrderIds as string[])].sort(),
    );
  });

  test("disabling shuffle restores the source order at the same track", () => {
    const base = makeTracks(20);
    get().setQueue(base, 0);
    get().setRemovePlayed(false);
    get().setShuffle(true);
    get().next();
    const currentId = get().getCurrent()?.id;
    get().setShuffle(false);
    expect(ids()).toEqual(base.map((t) => t.id));
    expect(get().getCurrent()?.id).toBe(currentId);
    expect(get().originalOrderIds).toBeNull();
  });

  test("playNow with shuffle on leads with the tapped track", () => {
    get().setShuffle(true);
    const base = makeTracks(20);
    get().playNow(base, 7);
    expect(get().currentIndex).toBe(0);
    expect(get().getCurrent()?.id).toBe("t8");
    expect([...ids()].sort()).toEqual([...base.map((t) => t.id)].sort());
    expect(get().originalOrderIds).toEqual(base.map((t) => t.id));
  });

  test("next in shuffle with removePlayed drops the played track", () => {
    get().setQueue(makeTracks(4), 1); // t2 current
    get().setRemovePlayed(true);
    get().setShuffle(true);
    const expectedNextId = get().queue[2].id;
    get().next();
    expect(get().queue).toHaveLength(3);
    expect(get().getCurrent()?.id).toBe(expectedNextId);
  });

  test("setQueue while shuffle on keeps the given order verbatim", () => {
    get().setQueue(makeTracks(3), 1);
    get().setShuffle(true);
    // Standing in for the Queue screen's manual reorder.
    get().setQueue(
      [
        { id: "t3", url: "url://t3" },
        { id: "t1", url: "url://t1" },
        { id: "t2", url: "url://t2" },
      ],
      0,
    );
    expect(ids()).toEqual(["t3", "t1", "t2"]);
    expect(get().getCurrent()?.id).toBe("t3");
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

  test("playNow replaces queue and index", () => {
    const base = makeTracks(3);
    get().setQueue(base, 0);
    get().playNow(
      [
        { id: "t3", url: "url://t3" },
        { id: "a", url: "url://a" },
      ],
      1,
    );
    expect(ids()).toEqual(["t3", "a"]);
    expect(get().currentIndex).toBe(1);
  });

  test("enqueueNext plays next even while shuffled", () => {
    get().setQueue(makeTracks(10), 0);
    get().setRemovePlayed(false);
    get().setShuffle(true);
    get().enqueueNext({ id: "x", url: "url://x" });
    expect(get().queue[1].id).toBe("x");
    get().next();
    expect(get().getCurrent()?.id).toBe("x");
  });
});

describe("queue store - removals and move", () => {
  test("removeByIds updates queue and index", () => {
    const base = makeTracks(4);
    get().setQueue(base, 2); // current t3
    get().removeByIds(["t1", "t2"]);
    expect(ids()).toEqual(["t3", "t4"]);
    // Two removed before index 2 → index becomes 0 (t3)
    expect(get().currentIndex).toBe(0);
  });

  test("removeAtIndices updates queue and index", () => {
    const base = makeTracks(5);
    get().setQueue(base, 3); // current t4
    get().removeAtIndices([0, 2, 4]); // remove t1, t3, t5
    expect(ids()).toEqual(["t2", "t4"]);
    // Removed one before current (t1, t3 are before t4) → index adjusts from 3 to 1
    expect(get().currentIndex).toBe(1);
  });

  test("removals stay out of the restored order when shuffle is turned off", () => {
    get().setQueue(makeTracks(5), 0);
    get().setShuffle(true);
    get().removeByIds(["t2", "t4"]);
    get().setShuffle(false);
    expect(ids()).toEqual(["t1", "t3", "t5"]);
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

describe("queue store - navigation with repeat all", () => {
  test("removePlayed still removes track when repeat all", () => {
    const base = makeTracks(2);
    get().setQueue(base, 0);
    get().setRemovePlayed(true);
    get().setRepeatMode("all");
    get().next(); // removes t1
    expect(get().queue.map((t) => t.id)).toEqual(["t2"]);
    expect(get().currentIndex).toBe(0);
  });
});

describe("queue store - updateTrack", () => {
  test("merges patch into the matching track and preserves id", () => {
    get().setQueue(makeTracks(2), 0);
    get().updateTrack("t2", { title: "Hello", id: "hijacked" } as Partial<
      TestTrack & { title: string }
    >);
    const t2 = get().queue.find((t) => t.id === "t2") as TestTrack & {
      title?: string;
    };
    expect(t2).toBeDefined();
    expect(t2?.title).toBe("Hello");
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  test("is a no-op when id does not exist", () => {
    get().setQueue(makeTracks(2), 0);
    const before = get().queue;
    get().updateTrack("missing", { title: "X" } as Partial<
      TestTrack & { title: string }
    >);
    expect(get().queue).toBe(before);
  });
});

describe("queue store - move guards and shifts", () => {
  test("no-op for from === to or out-of-range indices", () => {
    get().setQueue(makeTracks(3), 1);
    const before = get().queue;
    get().move(1, 1);
    expect(get().queue).toBe(before);
    get().move(-1, 0);
    expect(get().queue).toBe(before);
    get().move(0, 99);
    expect(get().queue).toBe(before);
  });

  test("from < currentIndex && to >= currentIndex shifts current down", () => {
    get().setQueue(makeTracks(4), 2); // t3 current
    get().move(0, 2); // [t2, t3, t1, t4], current must still point to t3
    expect(get().queue.map((t) => t.id)).toEqual(["t2", "t3", "t1", "t4"]);
    expect(get().currentIndex).toBe(1);
    expect(get().getCurrent()?.id).toBe("t3");
  });

  test("from > currentIndex && to <= currentIndex shifts current up", () => {
    get().setQueue(makeTracks(4), 1); // t2 current
    get().move(3, 1); // [t1, t4, t2, t3], current must still point to t2
    expect(get().queue.map((t) => t.id)).toEqual(["t1", "t4", "t2", "t3"]);
    expect(get().currentIndex).toBe(2);
    expect(get().getCurrent()?.id).toBe("t2");
  });
});

describe("queue store - enqueue with null currentIndex", () => {
  test("enqueueNext on empty queue inserts and sets index to 0", () => {
    get().enqueueNext({ id: "x", url: "url://x" });
    expect(get().queue.map((t) => t.id)).toEqual(["x"]);
    expect(get().currentIndex).toBe(0);
  });

  test("enqueueEnd on empty queue inserts and sets index to 0", () => {
    get().enqueueEnd([
      { id: "x", url: "url://x" },
      { id: "y", url: "url://y" },
    ]);
    expect(get().queue.map((t) => t.id)).toEqual(["x", "y"]);
    expect(get().currentIndex).toBe(0);
  });

  test("tracks enqueued while shuffled survive turning shuffle off", () => {
    get().setQueue(makeTracks(3), 0);
    get().setShuffle(true);
    get().enqueueNext([{ id: "x", url: "url://x" }]);
    get().enqueueEnd([{ id: "y", url: "url://y" }]);
    get().setShuffle(false);
    expect(ids()).toEqual(["t1", "t2", "t3", "x", "y"]);
  });
});

describe("queue store - removal edge cases", () => {
  test("removeAtIndices is a no-op when indices are all out of range", () => {
    get().setQueue(makeTracks(3), 1);
    const before = get().queue;
    get().removeAtIndices([-1, 99]);
    expect(get().queue).toBe(before);
  });

  test("removeAtIndices is a no-op when called with empty array", () => {
    get().setQueue(makeTracks(2), 0);
    const before = get().queue;
    get().removeAtIndices([]);
    expect(get().queue).toBe(before);
  });

  test("removeByIds is a no-op when called with empty array", () => {
    get().setQueue(makeTracks(2), 0);
    const before = get().queue;
    get().removeByIds([]);
    expect(get().queue).toBe(before);
  });

  test("setQueue with empty array clears currentIndex", () => {
    get().setQueue(makeTracks(2), 1);
    get().setQueue([], 0);
    expect(get().queue).toEqual([]);
    expect(get().currentIndex).toBeNull();
  });
});

describe("queue store - shuffle / repeat interactions", () => {
  test("setRepeatMode leaves the playback order alone", () => {
    get().setQueue(makeTracks(4), 1);
    get().setShuffle(true);
    const before = get().queue;
    get().setRepeatMode("all");
    expect(get().repeatMode).toBe("all");
    expect(get().queue).toBe(before);
  });

  test("previous in shuffle wraps to last with repeat all when at start", () => {
    get().setQueue(makeTracks(3), 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setShuffle(true);
    get().previous();
    expect(get().currentIndex).toBe(2);
  });

  test("a shuffled repeat-all wrap starts a fresh pass on a new order", () => {
    get().setQueue(makeTracks(20), 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setShuffle(true);
    const firstPass = ids();
    const lastId = firstPass[firstPass.length - 1];
    while ((get().currentIndex as number) < get().queue.length - 1) {
      get().next();
    }
    get().next(); // wraps
    expect(get().currentIndex).toBe(0);
    expect(ids()).not.toEqual(firstPass);
    expect([...ids()].sort()).toEqual([...firstPass].sort());
    // The track that just finished never leads the new pass.
    expect(get().getCurrent()?.id).not.toBe(lastId);
  });
});

describe("queue store - peekNextTrack mirrors next()", () => {
  // peekNextTrack must predict exactly where next() lands (it drives
  // gapless/crossfade preloads), except when it returns null on purpose
  // (shuffled repeat-all reshuffle / playback stop).
  const expectPeekMatchesNext = () => {
    const peeked = peekNextTrack();
    get().next();
    if (peeked !== null) {
      expect(get().getCurrent()?.id).toBe(peeked.id);
    }
    return peeked;
  };

  test("simple advance without repeat", () => {
    get().setQueue(makeTracks(3), 0);
    get().setRemovePlayed(false);
    expect(peekNextTrack()?.id).toBe("t2");
    expectPeekMatchesNext();
  });

  test("end of queue without repeat returns null", () => {
    get().setQueue(makeTracks(3), 2);
    get().setRemovePlayed(false);
    expect(peekNextTrack()).toBeNull();
  });

  test("repeat one stays on current", () => {
    get().setQueue(makeTracks(3), 1);
    get().setRemovePlayed(false);
    get().setRepeatMode("one");
    expect(peekNextTrack()?.id).toBe("t2");
    expectPeekMatchesNext();
  });

  test("repeat all wraps to first", () => {
    get().setQueue(makeTracks(3), 2);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    expect(peekNextTrack()?.id).toBe("t1");
    expectPeekMatchesNext();
  });

  test("shuffle follows the materialized queue order", () => {
    get().setQueue(makeTracks(5), 0);
    get().setRemovePlayed(false);
    get().setShuffle(true);
    expect(peekNextTrack()?.id).toBe(get().queue[1].id);
    expectPeekMatchesNext();
  });

  test("shuffled repeat-all wrap returns null (reshuffle boundary)", () => {
    get().setQueue(makeTracks(3), 0);
    get().setRemovePlayed(false);
    get().setRepeatMode("all");
    get().setShuffle(true);
    while ((get().currentIndex as number) < get().queue.length - 1) {
      expectPeekMatchesNext();
    }
    expect(peekNextTrack()).toBeNull();
  });

  test("removePlayed advances to the following track", () => {
    get().setQueue(makeTracks(3), 0);
    get().setRemovePlayed(true);
    expect(peekNextTrack()?.id).toBe("t2");
    expectPeekMatchesNext();
  });

  test("removePlayed on the last remaining track returns null", () => {
    get().setQueue(makeTracks(1), 0);
    get().setRemovePlayed(true);
    expect(peekNextTrack()).toBeNull();
  });

  test("empty queue and no current index return null", () => {
    expect(peekNextTrack()).toBeNull();
    useQueue.setState({ queue: makeTracks(2), currentIndex: null });
    expect(peekNextTrack()).toBeNull();
  });
});

describe("queue store - size cap", () => {
  const CAP = MAX_QUEUE_TRACKS;

  test("setQueue anchors the window at the start track", () => {
    get().setQueue(makeTracks(CAP + 200), 5);
    expect(get().queue).toHaveLength(CAP);
    // The window starts at the tapped track so the full cap of upcoming
    // tracks survives; entries before it are dropped.
    expect(get().queue[0].id).toBe("t6");
    expect(get().currentIndex).toBe(0);
    expect(get().queue[get().queue.length - 1].id).toBe(`t${CAP + 5}`);
  });

  test("setQueue windows around a start track beyond the cap", () => {
    get().setQueue(makeTracks(CAP + 200), CAP + 100);
    expect(get().queue).toHaveLength(CAP);
    // Window is pulled back so it stays full; the tapped track is inside it.
    expect(get().queue[get().currentIndex ?? -1].id).toBe(`t${CAP + 101}`);
    expect(get().queue[get().queue.length - 1].id).toBe(`t${CAP + 200}`);
  });

  test("playNow applies the same window", () => {
    get().playNow(makeTracks(CAP + 50), 10);
    expect(get().queue).toHaveLength(CAP);
    expect(get().queue[0].id).toBe("t11");
    expect(get().currentIndex).toBe(0);
    expect(get().getCurrent()?.id).toBe("t11");
  });

  test("enqueueNext at the cap evicts the far end to make room", () => {
    get().setQueue(makeTracks(CAP), 0);
    expect(get().enqueueNext(makeTracks(3, "n"))).toBe(3);
    expect(get().queue).toHaveLength(CAP);
    // Inserted right after the current track; the tail lost as many entries.
    expect(ids().slice(0, 5)).toEqual(["t1", "n1", "n2", "n3", "t2"]);
    expect(get().getCurrent()?.id).toBe("t1");
    expect(get().queue[CAP - 1].id).toBe(`t${CAP - 3}`);
  });

  test("enqueueNext at the cap evicts played tracks before the far end", () => {
    get().setQueue(makeTracks(CAP), 500);
    const upcoming = ids().slice(501);
    expect(get().enqueueNext(makeTracks(2, "n"))).toBe(2);
    expect(get().queue).toHaveLength(CAP);
    // The two oldest played tracks are gone, so the current track shifts down
    // and everything still ahead of it is untouched.
    expect(get().currentIndex).toBe(498);
    expect(get().getCurrent()?.id).toBe("t501");
    expect(ids()[0]).toBe("t3");
    expect(ids().slice(499, 501)).toEqual(["n1", "n2"]);
    expect(ids().slice(501)).toEqual(upcoming);
  });

  test("enqueueEnd at the cap appends and drops the previous last entry", () => {
    get().setQueue(makeTracks(CAP), 0);
    expect(get().enqueueEnd(makeTracks(1, "n"))).toBe(1);
    expect(get().queue).toHaveLength(CAP);
    expect(get().queue[CAP - 1].id).toBe("n1");
    expect(get().queue[CAP - 2].id).toBe(`t${CAP - 1}`);
    expect(get().getCurrent()?.id).toBe("t1");
  });

  test("an enqueue never evicts the current track or its own batch", () => {
    get().setQueue(makeTracks(CAP), 0);
    // One slot is reserved for the track playing now.
    expect(get().enqueueNext(makeTracks(CAP + 10, "n"))).toBe(CAP - 1);
    expect(get().queue).toHaveLength(CAP);
    expect(ids()[0]).toBe("t1");
    expect(ids().slice(1)).toEqual(makeTracks(CAP - 1, "n").map((t) => t.id));
  });

  test("enqueueEnd on an empty queue fills up to the cap", () => {
    expect(get().enqueueEnd(makeTracks(CAP + 10, "n"))).toBe(CAP);
    expect(get().queue).toHaveLength(CAP);
    expect(get().currentIndex).toBe(0);
  });
});
