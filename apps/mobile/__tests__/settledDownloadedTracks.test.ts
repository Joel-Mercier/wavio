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
jest.mock("@/services/offline", () => ({
  offlineDownloadService: {},
  librarySyncService: {},
}));
jest.mock("@/services/offline/downloadDestination", () => ({
  downloadedFileIsOnPrimaryVolume: () => true,
}));
jest.mock("@/utils/log", () => ({ logError: () => {} }));

import * as React from "react";
import TestRenderer from "react-test-renderer";
import { useSettledDownloadedTracks } from "@/hooks/offline/useDownloads";
import type { Child } from "@/services/openSubsonic/types";
import useOffline, { type OfflineTrack } from "@/stores/offline";

// The Offline downloads screen lists every download, sorted. Re-deriving that
// list on each completion stalled a 5000-track drain to ~1 track/s while the
// screen was open (#205), so it holds completions until the queue is empty.

const song = (id: string): Child => ({ id, isDir: false, title: id });
const offlineTrack = (id: string): OfflineTrack => ({
  id,
  title: id,
  duration: 1,
  path: `/doc/${id}.mp3`,
  size: 1,
  downloadedAt: "2026-01-01T00:00:00.000Z",
});

const roots: TestRenderer.ReactTestRenderer[] = [];
function mount(): string[][] {
  const seen: string[][] = [];
  const Probe = () => {
    seen.push(Object.keys(useSettledDownloadedTracks()).sort());
    return null;
  };
  TestRenderer.act(() => {
    roots.push(TestRenderer.create(React.createElement(Probe)));
  });
  return seen;
}

const act = (fn: () => void) => TestRenderer.act(fn);
const last = <T>(values: T[]) => values[values.length - 1];

beforeEach(() => {
  useOffline.setState({
    downloadedTracks: { a: offlineTrack("a") },
    downloadedCollections: {},
    downloadProgress: {},
    downloadQueue: [],
    artworkCache: {},
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
});

describe("useSettledDownloadedTracks", () => {
  it("follows the store while nothing is queued", () => {
    const seen = mount();
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("b")]);
    });
    expect(last(seen)).toEqual(["a", "b"]);
  });

  it("holds completions while the queue drains, then lands them together", () => {
    act(() => {
      useOffline.getState().addManyToDownloadQueue(["b", "c", "d"].map(song));
    });
    const seen = mount();
    const renders = seen.length;

    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("b")]);
    });
    act(() => {
      useOffline.getState().setDownloadProgress("c", {
        trackId: "c",
        status: "downloading",
        progress: 0.5,
      });
    });
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("c")]);
    });
    expect(seen).toHaveLength(renders);
    expect(last(seen)).toEqual(["a"]);

    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("d")]);
    });
    expect(last(seen)).toEqual(["a", "b", "c", "d"]);
  });

  it("lets a removal through mid-drain", () => {
    act(() => {
      useOffline.getState().addManyToDownloadQueue(["b", "c"].map(song));
    });
    const seen = mount();
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("b")]);
    });
    act(() => {
      useOffline.getState().removeDownloadedTrack("a");
    });
    expect(last(seen)).toEqual(["b"]);
  });

  // A drain that parks with tracks still queued (offline, disk full) sends no
  // more completions, so waiting for an empty queue would hold the list forever.
  it("catches up once completions stop arriving", () => {
    jest.useFakeTimers();
    try {
      act(() => {
        useOffline.getState().addManyToDownloadQueue(["b", "c"].map(song));
      });
      const seen = mount();
      act(() => {
        useOffline.getState().completeDownloads([offlineTrack("b")]);
      });
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(last(seen)).toEqual(["a"]);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(last(seen)).toEqual(["a", "b"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps holding while completions keep arriving", () => {
    jest.useFakeTimers();
    try {
      act(() => {
        useOffline
          .getState()
          .addManyToDownloadQueue(["b", "c", "d", "e"].map(song));
      });
      const seen = mount();
      for (const id of ["b", "c", "d"]) {
        act(() => {
          useOffline.getState().completeDownloads([offlineTrack(id)]);
        });
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(last(seen)).toEqual(["a"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("catches up when the queue empties without a completion", () => {
    act(() => {
      useOffline.getState().addManyToDownloadQueue(["b", "c"].map(song));
    });
    const seen = mount();
    act(() => {
      useOffline.getState().completeDownloads([offlineTrack("b")]);
    });
    act(() => {
      useOffline.getState().clearDownloadQueue();
    });
    expect(last(seen)).toEqual(["a", "b"]);
  });
});
