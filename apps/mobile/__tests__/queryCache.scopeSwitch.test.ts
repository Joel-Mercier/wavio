// The persisted React Query cache is what offline mode reads from, so a scope
// switch must never write one server's responses into another's keys — nor let
// the switch's clear() delete what the incoming scope is about to restore.
const mockScope = { value: "serverA_alice" };
const mockMem = new Map<string, string | number>();
const mockAuthListeners = new Set<() => void>();

jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string | number) => mockMem.set(k, v),
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
  registerPendingFlusher: () => () => {},
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
  currentAuthScope: () => mockScope.value,
  useAuthBase: {
    getState: () => ({ serverId: "x", username: "y" }),
    subscribe: (cb: () => void) => {
      mockAuthListeners.add(cb);
      return () => mockAuthListeners.delete(cb);
    },
  },
}));

import {
  getIsCacheRestoring,
  queryClient,
  setCacheRestoring,
} from "@/config/queryClient";
import {
  restorePersistedQueries,
  subscribeQueryPersistence,
} from "@/config/queryPersister";

const key = (scope: string, marker: string) =>
  `${scope}:wavio-rq:["${marker}"]`;

const switchAuthScope = (scope: string) => {
  mockScope.value = scope;
  for (const cb of mockAuthListeners) cb();
};

// Mirrors app/(app)/_layout.tsx's scope-change effect.
const restoreScope = (clear: boolean) => {
  setCacheRestoring(true);
  if (clear) queryClient.clear();
  jest.advanceTimersByTime(0);
  restorePersistedQueries();
  jest.advanceTimersByTime(0);
  setCacheRestoring(false);
};

// Past React Query's batched notification and the persister's flush delay.
const settle = () => jest.advanceTimersByTime(2100);

let unsubscribe: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  mockMem.clear();
  setCacheRestoring(true);
  queryClient.clear();
  jest.advanceTimersByTime(0);
  mockScope.value = "serverA_alice";
  unsubscribe = subscribeQueryPersistence();
  restoreScope(false);
});

afterEach(() => {
  unsubscribe();
  jest.useRealTimers();
});

describe("persisted query cache across a scope switch", () => {
  it("persists normally once a restore has finished", () => {
    queryClient.setQueryData(["A"], "A-DATA");
    settle();
    expect(mockMem.get(key("serverA_alice", "A"))).toContain("A-DATA");
  });

  it("flushes the outgoing scope's pending writes into its own keys", () => {
    queryClient.setQueryData(["A"], "A-DATA");
    jest.advanceTimersByTime(0);
    switchAuthScope("serverB_bob");
    expect(mockMem.get(key("serverA_alice", "A"))).toContain("A-DATA");
    expect(mockMem.has(key("serverB_bob", "A"))).toBe(false);
  });

  it("never writes a late outgoing response into the incoming scope", () => {
    switchAuthScope("serverB_bob");
    queryClient.setQueryData(["late"], "A-LATE");
    settle();
    expect(mockMem.has(key("serverB_bob", "late"))).toBe(false);
    expect(mockMem.has(key("serverA_alice", "late"))).toBe(false);
  });

  it("keeps the incoming scope's keys through the switch's clear()", () => {
    mockMem.set(
      key("serverB_bob", "B"),
      JSON.stringify({
        queryKey: ["B"],
        queryHash: '["B"]',
        state: { data: "B-DATA", dataUpdatedAt: Date.now(), status: "success" },
      }),
    );
    queryClient.setQueryData(["A"], "A-DATA");
    settle();

    switchAuthScope("serverB_bob");
    restoreScope(true);
    settle();

    expect(mockMem.get(key("serverB_bob", "B"))).toContain("B-DATA");
    expect(queryClient.getQueryData(["B"])).toBe("B-DATA");
    expect(queryClient.getQueryData(["A"])).toBeUndefined();
    // The outgoing scope keeps its cache for when the user comes back.
    expect(mockMem.get(key("serverA_alice", "A"))).toContain("A-DATA");

    queryClient.setQueryData(["B"], "B-FRESH");
    settle();
    expect(mockMem.get(key("serverB_bob", "B"))).toContain("B-FRESH");
  });

  it("keeps the outgoing scope's cache through logout's clear()", () => {
    queryClient.setQueryData(["A"], "A-DATA");
    settle();
    switchAuthScope("_");
    queryClient.clear();
    settle();
    expect(mockMem.get(key("serverA_alice", "A"))).toContain("A-DATA");
  });

  it("restores only its own scope", () => {
    queryClient.setQueryData(["A"], "A-DATA");
    settle();
    switchAuthScope("serverB_bob");
    restoreScope(true);
    expect(queryClient.getQueryData(["A"])).toBeUndefined();

    switchAuthScope("serverA_alice");
    restoreScope(true);
    expect(queryClient.getQueryData(["A"])).toBe("A-DATA");
  });

  it("leaves the restoring flag false so writes are never stuck off", () => {
    expect(getIsCacheRestoring()).toBe(false);
  });
});
