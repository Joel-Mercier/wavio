jest.mock("@/config/storage", () => {
  const { createJSONStorage } = jest.requireActual("zustand/middleware");
  const make = () => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  return {
    createThrottledScopedJSONStorage: () => createJSONStorage(make),
  };
});
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));
jest.mock("@/hooks/useIsOnline", () => ({ useIsOnline: () => true }));
jest.mock("@/config/queryClient", () => ({
  getIsCacheRestoring: () => false,
  subscribeCacheRestoring: () => () => {},
}));

import {
  hashKey,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import * as React from "react";
import TestRenderer from "react-test-renderer";
import { useIsCollectionAvailableOffline } from "@/hooks/offline/useOfflineAvailability";
import useOffline, { type OfflineTrack } from "@/stores/offline";

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

// Rendered through the hook so the store-side filtering is covered too: a
// download drain writes progress and queue state several times per track, and
// every Library row used to re-read its snapshot on each of them (#205).
describe("useIsCollectionAvailableOffline", () => {
  const makeOfflineTrack = (id: string): OfflineTrack => ({
    id,
    title: id,
    duration: 1,
    path: `/doc/${id}.mp3`,
    size: 1,
    downloadedAt: "2026-01-01T00:00:00.000Z",
  });

  const roots: TestRenderer.ReactTestRenderer[] = [];
  afterEach(() => {
    TestRenderer.act(() => {
      for (const root of roots.splice(0)) root.unmount();
    });
  });

  const mount = (client: QueryClient, id: string | undefined) => {
    const seen: boolean[] = [];
    const Probe = () => {
      seen.push(useIsCollectionAvailableOffline("playlist", id));
      return null;
    };
    TestRenderer.act(() => {
      roots.push(
        TestRenderer.create(
          React.createElement(
            QueryClientProvider,
            { client },
            React.createElement(Probe),
          ),
        ),
      );
    });
    return seen;
  };

  beforeEach(() => {
    useOffline.setState({
      downloadedTracks: {},
      downloadedCollections: {},
      downloadProgress: {},
      downloadQueue: [],
    });
  });

  it("flips once the last track lands, ignoring progress writes", () => {
    const client = makeClient();
    client.setQueryData(["playlist", "p1"], {
      playlist: { id: "p1", entry: [{ id: "a" }, { id: "b" }] },
    });
    useOffline.getState().addDownloadedTrack(makeOfflineTrack("a"));
    const seen = mount(client, "p1");
    expect(seen).toEqual([false]);

    TestRenderer.act(() => {
      useOffline.getState().setDownloadProgress("b", {
        trackId: "b",
        status: "downloading",
        progress: 0,
      });
    });
    expect(seen).toEqual([false]);

    TestRenderer.act(() => {
      useOffline.getState().completeDownload(makeOfflineTrack("b"));
    });
    expect(seen).toEqual([false, true]);
  });

  it("never subscribes without an id", () => {
    const client = makeClient();
    const subscribe = jest.spyOn(useOffline, "subscribe");
    const seen = mount(client, undefined);

    expect(seen).toEqual([false]);
    expect(subscribe).not.toHaveBeenCalled();
    subscribe.mockRestore();
  });
});
