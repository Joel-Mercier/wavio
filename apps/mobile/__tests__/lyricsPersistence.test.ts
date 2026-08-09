// A lyrics miss must not outlive the session. It is only ever a snapshot of one
// moment — LRCLIB's edge rejecting the request (a 520 on a track it serves fine
// with a proper User-Agent), a rate-limit block, tags that hadn't been corrected
// yet — and the persisted cache has a 7-day maxAge, so restoring one would pin
// "no lyrics" on that track with nothing able to dislodge it.
jest.mock("@/config/storage", () => ({
  storage: { set: () => {}, getString: () => null, remove: () => {} },
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
  currentAuthScope: () => "scope",
  useAuthBase: { getState: () => ({ serverType: "navidrome" }) },
}));

import type { Query } from "@tanstack/react-query";
import { persistOptions } from "@/config/queryClient";

const shouldPersist = (query: unknown) =>
  persistOptions.dehydrateOptions.shouldDehydrateQuery(query as Query);

// The shape dehydration inspects: a settled, successful query.
const query = (queryKey: unknown[], data: unknown): unknown => ({
  queryKey,
  queryHash: JSON.stringify(queryKey),
  state: {
    status: "success",
    data,
    dataUpdatedAt: Date.now(),
    fetchStatus: "idle",
  },
  meta: undefined,
});

const LYRICS_KEY = [
  "lrclib",
  "Sultans Of Swing",
  "Dire Straits",
  "Dire Straits",
  348,
];

describe("persisted query cache", () => {
  it("persists a lyrics sheet that was found", () => {
    const found = { lang: "xxx", synced: true, line: [{ value: "words" }] };
    expect(shouldPersist(query(LYRICS_KEY, found))).toBe(true);
  });

  it("does not persist a lyrics miss", () => {
    expect(shouldPersist(query(LYRICS_KEY, null))).toBe(false);
  });

  it("does not persist a lyrics miss stored as undefined", () => {
    expect(shouldPersist(query(LYRICS_KEY, undefined))).toBe(false);
  });

  // The manual picker's candidate list only matters while its sheet is open.
  it("does not persist the lyrics picker's search results", () => {
    const results = [{ id: 1, trackName: "t", artistName: "a" }];
    expect(
      shouldPersist(query(["lrclib:search", "t", "a", 348], results)),
    ).toBe(false);
  });

  it("still persists a null from any other query", () => {
    expect(shouldPersist(query(["album", "abc"], null))).toBe(true);
  });

  it("still skips infinite lists", () => {
    expect(shouldPersist(query(["albums:infinite"], [{ page: 1 }]))).toBe(
      false,
    );
  });
});
