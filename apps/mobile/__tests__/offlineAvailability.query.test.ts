import { hashKey, QueryClient } from "@tanstack/react-query";

// useIsDetailCached / useIsCollectionAvailableOffline no longer subscribe to the
// whole query cache: each row watches the single query behind it, matched by
// queryHash, and reads that query by hash instead of re-hashing its key on every
// notification. Both shortcuts rest on assumptions about React Query's cache —
// these lock them in so a version bump can't silently break offline gating.

// Each cached query arms a gc timer; clearing keeps Jest from hanging on them.
const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient();
  clients.push(client);
  return client;
};

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("query lookup by hash", () => {
  it("hashKey of a detail key matches the cached query's queryHash", () => {
    const client = makeClient();
    client.setQueryData(["album", "42"], { album: { id: "42" } });

    const cached = client.getQueryCache().get(hashKey(["album", "42"]));
    expect(cached).toBeDefined();
    expect(cached?.queryHash).toBe(hashKey(["album", "42"]));
  });

  it("reading by hash is equivalent to getQueryData", () => {
    const client = makeClient();
    client.setQueryData(["playlist", "p1"], { playlist: { id: "p1" } });

    for (const key of [
      ["playlist", "p1"],
      ["playlist", "missing"],
      ["album", "p1"],
    ]) {
      expect(client.getQueryCache().get(hashKey(key))?.state.data).toEqual(
        client.getQueryData(key),
      );
    }
  });

  it("distinguishes a query with no data from one holding data", () => {
    const client = makeClient();
    client.setQueryData(["album", "empty"], undefined);
    client.setQueryData(["album", "full"], { album: { id: "full" } });

    const read = (id: string) =>
      client.getQueryCache().get(hashKey(["album", id]))?.state.data !==
      undefined;

    expect(read("full")).toBe(true);
    expect(read("empty")).toBe(false);
    expect(read("absent")).toBe(false);
  });

  it("an undefined id hashes to a key that never matches a real query", () => {
    const client = makeClient();
    client.setQueryData(["album", "42"], { album: { id: "42" } });

    expect(
      client.getQueryCache().get(hashKey(["album", undefined])),
    ).toBeUndefined();
  });
});

describe("cache event filtering by queryHash", () => {
  it("fires only for the watched query", () => {
    const client = makeClient();
    const watched = hashKey(["album", "42"]);
    const hits: string[] = [];

    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === watched) hits.push(event.type);
    });

    client.setQueryData(["album", "99"], { album: { id: "99" } });
    client.setQueryData(["artist", "42"], { artist: { id: "42" } });
    expect(hits).toHaveLength(0);

    client.setQueryData(["album", "42"], { album: { id: "42" } });
    expect(hits.length).toBeGreaterThan(0);

    unsubscribe();
  });

  it("every cache event carries the query it concerns", () => {
    const client = makeClient();
    const seen: unknown[] = [];

    const unsubscribe = client
      .getQueryCache()
      .subscribe((event) => seen.push(event.query?.queryHash));

    client.setQueryData(["album", "1"], { album: { id: "1" } });
    client.removeQueries({ queryKey: ["album", "1"] });

    expect(seen.length).toBeGreaterThan(0);
    for (const hash of seen) expect(typeof hash).toBe("string");

    unsubscribe();
  });
});
