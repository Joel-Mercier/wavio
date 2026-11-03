const mockSetItem = jest.fn();
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    zustandStorage: {
      setItem: (k: string, v: string) => {
        mockSetItem(k, v);
        mem.set(k, v);
      },
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

import {
  podcastPlayedBucket,
  podcastPlayedKey,
  usePodcastPlayedBase,
} from "@/stores/podcastPlayed";

const get = () => usePodcastPlayedBase.getState();

beforeEach(() => {
  usePodcastPlayedBase.setState({ played: {} }, false);
  mockSetItem.mockClear();
});

describe("podcastPlayedBucket", () => {
  it("puts Taddy episodes in one server-independent bucket", () => {
    expect(podcastPlayedBucket("taddy", "scope-a")).toBe(
      podcastPlayedBucket("taddy", "scope-b"),
    );
  });

  it("buckets server episodes by scope, and has none without one", () => {
    expect(podcastPlayedBucket("server", "scope-a")).toBe("scope-a");
    expect(podcastPlayedBucket("server", undefined)).toBeUndefined();
  });
});

describe("podcastPlayed store", () => {
  it("marks and unmarks an episode", () => {
    get().markPlayed("scope-a", "ep-1");
    expect(get().isPlayed("scope-a", "ep-1")).toBe(true);
    get().markUnplayed("scope-a", "ep-1");
    expect(get().isPlayed("scope-a", "ep-1")).toBe(false);
  });

  it("keeps the same id apart across buckets", () => {
    const taddy = podcastPlayedBucket("taddy", undefined) as string;
    get().markPlayed("scope-a", "ep-1");
    expect(get().isPlayed("scope-b", "ep-1")).toBe(false);
    expect(get().isPlayed(taddy, "ep-1")).toBe(false);
    get().markPlayed(taddy, "ep-1");
    get().markUnplayed("scope-a", "ep-1");
    expect(get().isPlayed(taddy, "ep-1")).toBe(true);
  });

  it("unmarking an unplayed episode neither sets nor persists", () => {
    const before = get().played;
    get().markUnplayed("scope-a", "nope");
    expect(get().played).toBe(before);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("re-marking a played episode neither sets nor persists", () => {
    get().markPlayed("scope-a", "ep-1");
    mockSetItem.mockClear();
    const before = get().played;
    get().markPlayed("scope-a", "ep-1");
    expect(get().played).toBe(before);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe("podcastPlayed storage size", () => {
  it("stores a short hash rather than the episode id", () => {
    const id = `local-pod-ep-${"68747470733a2f2f".repeat(20)}`;
    get().markPlayed("scope-a", id);
    const [key] = Object.keys(get().played["scope-a"]);
    expect(key).toBe(podcastPlayedKey(id));
    expect(key.length).toBeLessThanOrEqual(11);
    expect(get().isPlayed("scope-a", id)).toBe(true);
  });

  it("hashes distinct ids apart", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 20000; i++) keys.add(podcastPlayedKey(`ep-${i}`));
    expect(keys.size).toBe(20000);
  });

  it("drops the oldest marks once a bucket passes the cap", () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 5001; i++) {
        jest.setSystemTime(1_000_000 + i);
        get().markPlayed("scope-a", `ep-${i}`);
      }
      expect(Object.keys(get().played["scope-a"])).toHaveLength(5000);
      expect(get().isPlayed("scope-a", "ep-0")).toBe(false);
      expect(get().isPlayed("scope-a", "ep-1")).toBe(true);
      expect(get().isPlayed("scope-a", "ep-5000")).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("the cap is per bucket", () => {
    get().markPlayed("taddy", "t-1");
    for (let i = 0; i < 5001; i++) get().markPlayed("scope-a", `ep-${i}`);
    expect(get().isPlayed("taddy", "t-1")).toBe(true);
  });
});

describe("forgetBuckets", () => {
  it("drops only the matching buckets", () => {
    get().markPlayed("srv1_alice", "ep-1");
    get().markPlayed("srv1_bob", "ep-1");
    get().markPlayed("srv2_alice", "ep-1");
    get().markPlayed("taddy", "ep-1");
    get().forgetBuckets((bucket) => bucket.startsWith("srv1_"));
    expect(Object.keys(get().played).sort()).toEqual(["srv2_alice", "taddy"]);
  });

  it("a match-nothing call doesn't persist", () => {
    get().markPlayed("taddy", "ep-1");
    mockSetItem.mockClear();
    get().forgetBuckets(() => false);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe("markAllPlayed", () => {
  it("marks every id in one persist write", () => {
    get().markAllPlayed("scope-a", ["ep-1", "ep-2", "ep-3"]);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    for (const id of ["ep-1", "ep-2", "ep-3"]) {
      expect(get().isPlayed("scope-a", id)).toBe(true);
    }
  });

  it("keeps the original date of episodes already played", () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1000);
      get().markPlayed("scope-a", "ep-1");
      jest.setSystemTime(2000);
      get().markAllPlayed("scope-a", ["ep-1", "ep-2"]);
      const bucket = get().played["scope-a"];
      expect(bucket[podcastPlayedKey("ep-1")]).toBe(1000);
      expect(bucket[podcastPlayedKey("ep-2")]).toBe(2000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("doesn't persist when everything is already played", () => {
    get().markAllPlayed("scope-a", ["ep-1", "ep-2"]);
    mockSetItem.mockClear();
    get().markAllPlayed("scope-a", ["ep-2", "ep-1"]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe("markAllUnplayed", () => {
  it("unmarks the listed ids in one write and leaves the rest", () => {
    get().markAllPlayed("scope-a", ["ep-1", "ep-2", "ep-3"]);
    mockSetItem.mockClear();
    get().markAllUnplayed("scope-a", ["ep-1", "ep-2", "never-played"]);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(get().isPlayed("scope-a", "ep-1")).toBe(false);
    expect(get().isPlayed("scope-a", "ep-2")).toBe(false);
    expect(get().isPlayed("scope-a", "ep-3")).toBe(true);
  });

  it("doesn't persist when nothing listed is played", () => {
    get().markPlayed("scope-a", "ep-3");
    mockSetItem.mockClear();
    get().markAllUnplayed("scope-a", ["ep-1", "ep-2"]);
    get().markAllUnplayed("scope-b", ["ep-3"]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
