// The persisted React Query cache is what offline mode reads from, so the
// write-gating added for scope switches must never cost us a persisted cache
// during normal (including offline) operation.
const mockScope = { value: "serverA_alice" };
const mockMem = new Map<string, string>();

jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string) => mockMem.set(k, v),
    getString: (k: string) => mockMem.get(k) ?? null,
    remove: (k: string) => mockMem.delete(k),
  },
  QUERY_CACHE_KEY: "wavio-rq-cache",
  scopedQueryCacheKey: (scope: string) => `${scope}:wavio-rq-cache`,
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
  withScopedWritesSuspended: <T>(fn: () => T): T => fn(),
}));

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope.value,
  useAuthBase: { getState: () => ({ serverId: "x", username: "y" }) },
}));

import {
  getIsCacheRestoring,
  queryPersister,
  setCacheRestoring,
} from "@/config/queryClient";

const blob = (marker: string) => ({
  buster: "",
  timestamp: Date.now(),
  clientState: {
    mutations: [],
    queries: [
      {
        queryKey: [marker],
        queryHash: `["${marker}"]`,
        state: { data: marker, dataUpdatedAt: Date.now() },
      },
    ],
  },
});

// The persister throttles writes; give each one room to land.
const settle = () => new Promise((r) => setTimeout(r, 1100));

describe("persisted query cache across a scope switch", () => {
  beforeEach(() => {
    mockMem.clear();
    mockScope.value = "serverA_alice";
    setCacheRestoring(false);
  });

  it("persists normally once a restore has finished", async () => {
    await queryPersister.persistClient(blob("A") as never);
    await settle();
    expect(mockMem.get("serverA_alice:wavio-rq-cache")).toContain("A");
  });

  it("keeps writing while offline (gating is not tied to connectivity)", async () => {
    await queryPersister.persistClient(blob("offline-data") as never);
    await settle();
    expect(mockMem.get("serverA_alice:wavio-rq-cache")).toContain(
      "offline-data",
    );
  });

  it("does not let the cleared cache clobber the incoming scope's blob", async () => {
    // Server B already has a persisted cache from an earlier session.
    mockScope.value = "serverB_bob";
    await queryPersister.persistClient(blob("B-DATA") as never);
    await settle();

    // Switch A -> B: the layout flags a restore, clears the client, and the
    // throttled write from that clear arrives with B already active.
    setCacheRestoring(true);
    mockScope.value = "serverB_bob";
    await queryPersister.persistClient({
      buster: "",
      timestamp: Date.now(),
      clientState: { mutations: [], queries: [] },
    } as never);
    await settle();

    expect(mockMem.get("serverB_bob:wavio-rq-cache")).toContain("B-DATA");

    // Restore finished -> writes resume, so offline mode keeps getting fed.
    setCacheRestoring(false);
    await queryPersister.persistClient(blob("B-FRESH") as never);
    await settle();
    expect(mockMem.get("serverB_bob:wavio-rq-cache")).toContain("B-FRESH");
  });

  it("restores the blob it just protected", async () => {
    mockScope.value = "serverB_bob";
    await queryPersister.persistClient(blob("B-DATA") as never);
    await settle();

    setCacheRestoring(true);
    const restored = await queryPersister.restoreClient();
    setCacheRestoring(false);
    expect(JSON.stringify(restored)).toContain("B-DATA");
  });

  it("leaves the restoring flag false so writes are never stuck off", () => {
    expect(getIsCacheRestoring()).toBe(false);
  });
});
