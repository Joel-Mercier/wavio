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
jest.mock("@/hooks/useIsOnline", () => ({ useIsOnline: () => mockOnline }));
jest.mock("@/config/queryClient", () => ({
  getIsCacheRestoring: () => false,
  subscribeCacheRestoring: () => () => {},
}));
jest.mock("@/services/offline", () => ({
  offlineDownloadService: {
    subscribeRemovingCollections: () => () => {},
    isRemovingCollection: () => false,
  },
}));
jest.mock("@/services/offline/artworkCacheService", () => ({
  artworkCacheService: { enqueue: () => {}, pruneOrphaned: () => {} },
  cacheArtworkForTracks: () => {},
}));

let mockOnline = true;

import * as React from "react";
import TestRenderer from "react-test-renderer";
import {
  useCollectionDownload,
  useCollectionDownloadedCount,
} from "@/hooks/offline/useCollectionDownload";
import { useHasPlayableTracks } from "@/hooks/offline/useOfflineAvailability";
import type { Child } from "@/services/openSubsonic/types";
import useOffline, { type OfflineTrack } from "@/stores/offline";

// A download drain writes the offline store several times per track. The
// playlist and album screens used to re-render on every one of those writes,
// which was most of the drain's JS cost with a detail screen open (#205).

const song = (id: string): Child => ({ id, isDir: false, title: id });
const offlineTrack = (id: string): OfflineTrack => ({
  id,
  title: id,
  duration: 1,
  path: `/doc/${id}.mp3`,
  size: 1,
  downloadedAt: "2026-01-01T00:00:00.000Z",
});
const songs = ["a", "b", "c"].map(song);
const ids = songs.map((s) => s.id);

const roots: TestRenderer.ReactTestRenderer[] = [];
function mount<T>(useValue: () => T): T[] {
  const seen: T[] = [];
  const Probe = () => {
    seen.push(useValue());
    return null;
  };
  TestRenderer.act(() => {
    roots.push(TestRenderer.create(React.createElement(Probe)));
  });
  return seen;
}

const act = (fn: () => void) => TestRenderer.act(fn);

beforeEach(() => {
  mockOnline = true;
  useOffline.setState({
    downloadedTracks: {},
    downloadedCollections: {},
    downloadProgress: Object.fromEntries(
      ids.map((id) => [id, { trackId: id, status: "pending", progress: 0 }]),
    ),
    downloadQueue: [],
    artworkCache: {},
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
});

describe("useCollectionDownload", () => {
  it("re-renders only when the collection's status changes", () => {
    const seen = mount(() => useCollectionDownload(songs).status);
    expect(seen).toEqual(["downloading"]);

    act(() => {
      useOffline.getState().setDownloadProgress("a", {
        trackId: "a",
        status: "downloading",
        progress: 0,
      });
      useOffline.getState().addCachedArtwork("cover", "file:///cover.jpg");
    });
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("a")]);
    });
    expect(seen).toEqual(["downloading"]);

    act(() => {
      useOffline
        .getState()
        .completeDownloads([offlineTrack("b"), offlineTrack("c")]);
    });
    expect(seen).toEqual(["downloading", "all"]);
  });

  it("leaves the running count to the leaf that shows it", () => {
    const seen = mount(() => useCollectionDownloadedCount(ids));
    expect(seen).toEqual([0]);

    act(() => {
      useOffline.getState().addCachedArtwork("cover", "file:///cover.jpg");
    });
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("a")]);
    });
    expect(seen).toEqual([0, 1]);
  });
});

describe("useHasPlayableTracks", () => {
  it("never re-renders from downloads while online", () => {
    const seen = mount(() => useHasPlayableTracks(songs));
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("a")]);
    });
    expect(seen).toEqual([true]);
  });

  it("follows the downloads while offline", () => {
    mockOnline = false;
    const seen = mount(() => useHasPlayableTracks(songs));
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("a")]);
    });
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("b")]);
    });
    expect(seen).toEqual([false, true]);
  });
});
