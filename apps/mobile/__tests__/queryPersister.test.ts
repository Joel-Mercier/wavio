// Issue #205: persisting has to cost what changed, not what's cached. A cache
// event marks one query; a flush serializes the marked queries alone.
const mockMem = new Map<string, string | number>();
const mockSet = jest.fn();
const mockFlushers = new Set<() => void>();

jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string | number) => {
      mockSet(k);
      mockMem.set(k, v);
    },
    getString: (k: string) => {
      const v = mockMem.get(k);
      return typeof v === "string" ? v : undefined;
    },
    getNumber: (k: string) => {
      const v = mockMem.get(k);
      return typeof v === "number" ? v : undefined;
    },
    remove: (k: string) => mockMem.delete(k),
    getAllKeys: () => [...mockMem.keys()],
  },
  registerPendingFlusher: (flush: () => void) => {
    mockFlushers.add(flush);
    return () => mockFlushers.delete(flush);
  },
  scopedQueryCachePrefix: (scope: string) => `${scope}:wavio-rq:`,
  scopedQueryCacheTouchedKey: (scope: string) => `${scope}:wavio-rq-touched`,
  scopedLegacyQueryCacheKey: (scope: string) => `${scope}:wavio-rq-cache`,
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
  withScopedWritesSuspended: <T>(fn: () => T): T => fn(),
}));

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: {
    getState: () => ({ serverId: "x", username: "y" }),
    subscribe: () => () => {},
  },
}));

import { queryClient, setCacheRestoring } from "@/config/queryClient";
import {
  getPersistedCacheSize,
  removePersistedQueries,
  restorePersistedQueries,
  subscribeQueryPersistence,
} from "@/config/queryPersister";

const DAY = 24 * 60 * 60 * 1000;
const PREFIX = "scope:wavio-rq:";
const keyOf = (queryKey: unknown[]) => PREFIX + JSON.stringify(queryKey);
const persistedKeys = () =>
  [...mockMem.keys()].filter((k) => k.startsWith(PREFIX));

const entry = (
  queryKey: unknown[],
  data: unknown,
  dataUpdatedAt = Date.now(),
) =>
  JSON.stringify({
    queryKey,
    queryHash: JSON.stringify(queryKey),
    state: { data, dataUpdatedAt, status: "success" },
  });

const restore = () => {
  setCacheRestoring(true);
  queryClient.clear();
  jest.advanceTimersByTime(0);
  restorePersistedQueries();
  jest.advanceTimersByTime(0);
  setCacheRestoring(false);
};

const settle = () => jest.advanceTimersByTime(2100);

let unsubscribe: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  mockMem.clear();
  unsubscribe = subscribeQueryPersistence();
  restore();
  mockSet.mockClear();
});

afterEach(() => {
  unsubscribe();
  jest.useRealTimers();
});

describe("query persister", () => {
  it("serializes only the queries that changed", () => {
    queryClient.setQueryData(["a"], 1);
    queryClient.setQueryData(["b"], 2);
    settle();
    expect(persistedKeys().sort()).toEqual([keyOf(["a"]), keyOf(["b"])]);

    mockSet.mockClear();
    queryClient.setQueryData(["a"], 3);
    settle();
    expect(mockSet.mock.calls.map(([k]) => k)).toEqual([keyOf(["a"])]);
    expect(mockMem.get(keyOf(["a"]))).toContain("3");
  });

  it("coalesces repeated changes to one write per flush", () => {
    for (let i = 0; i < 50; i++) queryClient.setQueryData(["a"], i);
    settle();
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it("deletes the key of a removed query", () => {
    queryClient.setQueryData(["a"], 1);
    settle();
    queryClient.removeQueries({ queryKey: ["a"] });
    settle();
    expect(mockMem.has(keyOf(["a"]))).toBe(false);
  });

  it("deletes the key of a query that stopped being persistable", () => {
    queryClient.setQueryData(["lrclib", "t1"], { lyrics: "x" });
    settle();
    expect(mockMem.has(keyOf(["lrclib", "t1"]))).toBe(true);
    queryClient.setQueryData(["lrclib", "t1"], null);
    settle();
    expect(mockMem.has(keyOf(["lrclib", "t1"]))).toBe(false);
  });

  it("never persists infinite queries", () => {
    queryClient.setQueryData(["artistSongs:infinite", "x"], {
      pages: [],
      pageParams: [],
    });
    settle();
    expect(persistedKeys()).toEqual([]);
  });

  it("writes pending changes when flushPendingScopedWrites runs", () => {
    queryClient.setQueryData(["a"], 1);
    jest.advanceTimersByTime(0);
    for (const flush of mockFlushers) flush();
    expect(mockMem.has(keyOf(["a"]))).toBe(true);
  });

  it("restores persisted queries", () => {
    mockMem.set(keyOf(["a"]), entry(["a"], "A"));
    restore();
    expect(queryClient.getQueryData(["a"])).toBe("A");
  });

  it("keeps old data while the scope keeps being restored", () => {
    mockMem.set(keyOf(["a"]), entry(["a"], "A", Date.now() - 30 * DAY));
    restore();
    expect(queryClient.getQueryData(["a"])).toBe("A");
  });

  it("drops a scope that hasn't been restored for over 7 days", () => {
    mockMem.set(keyOf(["a"]), entry(["a"], "A"));
    mockMem.set("scope:wavio-rq-touched", Date.now() - 8 * DAY);
    restore();
    expect(queryClient.getQueryData(["a"])).toBeUndefined();
    expect(persistedKeys()).toEqual([]);
  });

  it("splits the legacy blob into per-query keys, minus retired roots", () => {
    const query = (queryKey: unknown[], data: unknown) => ({
      queryKey,
      queryHash: JSON.stringify(queryKey),
      state: { data, dataUpdatedAt: Date.now(), status: "success" },
    });
    mockMem.set(
      "scope:wavio-rq-cache",
      JSON.stringify({
        buster: "",
        timestamp: Date.now(),
        clientState: {
          mutations: [],
          queries: [
            query(["album", "1"], "ALBUM"),
            query(["artistSongs", "va"], "HUGE"),
          ],
        },
      }),
    );
    restore();
    expect(mockMem.has("scope:wavio-rq-cache")).toBe(false);
    expect(persistedKeys()).toEqual([keyOf(["album", "1"])]);
    expect(queryClient.getQueryData(["album", "1"])).toBe("ALBUM");
  });

  it("drops a stale legacy blob", () => {
    mockMem.set(
      "scope:wavio-rq-cache",
      JSON.stringify({
        timestamp: Date.now() - 8 * DAY,
        clientState: { mutations: [], queries: [] },
      }),
    );
    restore();
    expect(mockMem.has("scope:wavio-rq-cache")).toBe(false);
  });

  it("removes the scope's cache, pending writes included", () => {
    mockMem.set('other:wavio-rq:["a"]', entry(["a"], "OTHER"));
    queryClient.setQueryData(["a"], 1);
    settle();
    queryClient.setQueryData(["b"], 2);
    jest.advanceTimersByTime(0);
    queryClient.clear();
    removePersistedQueries();
    settle();
    expect(persistedKeys()).toEqual([]);
    expect(mockMem.has('other:wavio-rq:["a"]')).toBe(true);
  });

  it("reports the persisted size, pending writes included", () => {
    queryClient.setQueryData(["a"], "x".repeat(100));
    jest.advanceTimersByTime(0);
    expect(getPersistedCacheSize()).toBeGreaterThan(100);
  });
});
