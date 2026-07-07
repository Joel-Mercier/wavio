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
  useAuthBase: {
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
}));

let mockOnline = true;

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
  subscribeEffectiveOnline: jest.fn(() => () => {}),
}));

jest.mock("@/config/queryClient", () => ({ queryClient: {} }));
jest.mock("@/utils/invalidateKeys", () => ({ invalidateKeys: jest.fn() }));
jest.mock("@/hooks/backend/useMediaAnnotation", () => ({
  STARRED_AFFECTED_KEYS: [["starred2"]],
  RATING_AFFECTED_KEYS: [["ratedAlbums"]],
}));
jest.mock("@/services/errorReporting", () => ({
  isNetworkNoise: (error: unknown) =>
    !!(error as { isNetworkError?: boolean } | null)?.isNetworkError,
  reportError: jest.fn(),
}));
jest.mock("@/services/openSubsonic", () => ({
  isSubsonicDataNotFound: (error: unknown) =>
    (error as { code?: number } | null)?.code === 70,
}));
jest.mock("@/services/backend/mediaAnnotation", () => ({
  star: jest.fn(),
  unstar: jest.fn(),
  setRating: jest.fn(),
}));
jest.mock("@/services/backend/playlists", () => ({
  getPlaylist: jest.fn(),
  updatePlaylist: jest.fn(),
  deletePlaylist: jest.fn(),
}));

import { setRating, star, unstar } from "@/services/backend/mediaAnnotation";
import {
  deletePlaylist,
  getPlaylist,
  updatePlaylist,
} from "@/services/backend/playlists";
import { reportError } from "@/services/errorReporting";
import {
  drainOfflineMutations,
  initOfflineMutationReplay,
  stopOfflineMutationReplay,
  subscribeDrainResult,
} from "@/services/offlineMutations/replay";
import useOfflineMutations, {
  type OfflineAction,
  type QueuedMutation,
} from "@/stores/offlineMutations";
import { invalidateKeys } from "@/utils/invalidateKeys";

const starMock = star as jest.Mock;
const unstarMock = unstar as jest.Mock;
const setRatingMock = setRating as jest.Mock;
const getPlaylistMock = getPlaylist as jest.Mock;
const updatePlaylistMock = updatePlaylist as jest.Mock;
const deletePlaylistMock = deletePlaylist as jest.Mock;
const invalidateKeysMock = invalidateKeys as jest.Mock;
const reportErrorMock = reportError as jest.Mock;

let seedCounter = 0;
const seed = (
  action: OfflineAction,
  overrides: Partial<QueuedMutation> = {},
): QueuedMutation => ({
  id: `seed-${seedCounter++}`,
  createdAt: seedCounter,
  retryCount: 0,
  status: "pending",
  action,
  ...overrides,
});

const setQueue = (items: QueuedMutation[]) =>
  useOfflineMutations.setState({ queue: items });

const queue = () => useOfflineMutations.getState().queue;

const drain = async () => {
  const promise = drainOfflineMutations();
  await jest.advanceTimersByTimeAsync(10_000);
  await promise;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  stopOfflineMutationReplay();
  mockOnline = true;
  setQueue([]);
  starMock.mockResolvedValue({});
  unstarMock.mockResolvedValue({});
  setRatingMock.mockResolvedValue({});
  getPlaylistMock.mockResolvedValue({ playlist: { entry: [] } });
  updatePlaylistMock.mockResolvedValue({});
  deletePlaylistMock.mockResolvedValue({});
});

afterEach(() => {
  stopOfflineMutationReplay();
  jest.useRealTimers();
});

describe("drainOfflineMutations - execution", () => {
  test("replays items sequentially in queue order and empties the queue", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
      seed({
        type: "star",
        target: { kind: "album", id: "a1" },
        starred: false,
      }),
      seed({ type: "setRating", id: "s2", rating: 4 }),
      seed({ type: "playlistAddSongs", playlistId: "p1", songIds: ["x"] }),
    ]);
    await drain();
    expect(starMock).toHaveBeenCalledWith({ id: "s1" });
    expect(unstarMock).toHaveBeenCalledWith({ albumId: "a1" });
    expect(setRatingMock).toHaveBeenCalledWith("s2", 4);
    expect(updatePlaylistMock).toHaveBeenCalledWith("p1", {
      songIdToAdd: ["x"],
    });
    expect(queue()).toHaveLength(0);
    const starOrder = starMock.mock.invocationCallOrder[0];
    const unstarOrder = unstarMock.mock.invocationCallOrder[0];
    const ratingOrder = setRatingMock.mock.invocationCallOrder[0];
    expect(starOrder).toBeLessThan(unstarOrder);
    expect(unstarOrder).toBeLessThan(ratingOrder);
  });

  test("invalidates the union of affected keys once after the drain", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
      seed({ type: "playlistEdit", playlistId: "p1", name: "N" }),
    ]);
    await drain();
    expect(invalidateKeysMock).toHaveBeenCalledTimes(1);
    const keys = invalidateKeysMock.mock.calls[0][1];
    expect(keys).toEqual(
      expect.arrayContaining([["starred2"], ["playlist"], ["playlists"]]),
    );
    expect(keys).not.toEqual(expect.arrayContaining([["ratedAlbums"]]));
  });

  test("resolves removal indices against a fresh playlist snapshot", async () => {
    setQueue([
      seed({
        type: "playlistRemoveSongs",
        playlistId: "p1",
        songIds: ["a", "a", "missing"],
      }),
    ]);
    getPlaylistMock.mockResolvedValue({
      playlist: {
        entry: [{ id: "a" }, { id: "b" }, { id: "a" }],
      },
    });
    await drain();
    expect(updatePlaylistMock).toHaveBeenCalledWith("p1", {
      songIndexToRemove: ["0", "2"],
    });
    expect(queue()).toHaveLength(0);
  });

  test("skips the server call when no queued removal is still present", async () => {
    setQueue([
      seed({ type: "playlistRemoveSongs", playlistId: "p1", songIds: ["z"] }),
    ]);
    getPlaylistMock.mockResolvedValue({ playlist: { entry: [{ id: "a" }] } });
    await drain();
    expect(updatePlaylistMock).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(0);
  });

  test("treats deleting an already-deleted playlist as success", async () => {
    setQueue([seed({ type: "playlistDelete", playlistId: "p1" })]);
    deletePlaylistMock.mockRejectedValue({ code: 70 });
    const results: number[] = [];
    const unsubscribe = subscribeDrainResult(({ dropped }) =>
      results.push(dropped),
    );
    await drain();
    unsubscribe();
    expect(queue()).toHaveLength(0);
    expect(results).toHaveLength(0);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});

describe("drainOfflineMutations - failure handling", () => {
  test("network error aborts the drain without bumping retryCount", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
      seed({ type: "star", target: { kind: "song", id: "s2" }, starred: true }),
    ]);
    starMock.mockRejectedValue({ isNetworkError: true });
    await drain();
    expect(starMock).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(2);
    expect(queue()[0].retryCount).toBe(0);
    expect(queue()[0].status).toBe("pending");
  });

  test("auth error aborts the drain leaving items pending", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
      seed({ type: "setRating", id: "s2", rating: 3 }),
    ]);
    starMock.mockRejectedValue({ code: 40 });
    await drain();
    expect(setRatingMock).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(2);
  });

  test("retriable error bumps retryCount and drops after MAX_ATTEMPTS", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
    ]);
    starMock.mockRejectedValue(new Error("boom"));
    const results: number[] = [];
    const unsubscribe = subscribeDrainResult(({ dropped }) =>
      results.push(dropped),
    );
    await drain();
    expect(queue()[0].retryCount).toBe(1);
    await drain();
    expect(queue()[0].retryCount).toBe(2);
    await drain();
    unsubscribe();
    expect(queue()).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([1]);
  });

  test("a not-found playlist purges all remaining actions for that playlist", async () => {
    setQueue([
      seed({ type: "playlistRemoveSongs", playlistId: "p1", songIds: ["a"] }),
      seed({ type: "playlistEdit", playlistId: "p1", name: "N" }),
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
    ]);
    getPlaylistMock.mockRejectedValue({ code: 70 });
    const results: number[] = [];
    const unsubscribe = subscribeDrainResult(({ dropped }) =>
      results.push(dropped),
    );
    await drain();
    unsubscribe();
    expect(queue()).toHaveLength(0);
    expect(starMock).toHaveBeenCalledWith({ id: "s1" });
    expect(results).toEqual([1]);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  test("a concurrent drain call does not double-process items", async () => {
    setQueue([
      seed({ type: "star", target: { kind: "song", id: "s1" }, starred: true }),
    ]);
    const first = drainOfflineMutations();
    const second = drainOfflineMutations();
    await jest.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);
    expect(starMock).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(0);
  });
});

describe("reconcile on init", () => {
  test("interrupted adds only send songs not already on the playlist", async () => {
    setQueue([
      seed(
        { type: "playlistAddSongs", playlistId: "p1", songIds: ["a", "b"] },
        { status: "inFlight" },
      ),
    ]);
    mockOnline = false;
    initOfflineMutationReplay();
    expect(queue()[0].status).toBe("pending");
    mockOnline = true;
    getPlaylistMock.mockResolvedValue({ playlist: { entry: [{ id: "a" }] } });
    await drain();
    expect(updatePlaylistMock).toHaveBeenCalledWith("p1", {
      songIdToAdd: ["b"],
    });
    expect(queue()).toHaveLength(0);
  });

  test("interrupted non-add items are simply reset to pending", async () => {
    setQueue([
      seed(
        { type: "star", target: { kind: "song", id: "s1" }, starred: true },
        { status: "inFlight" },
      ),
    ]);
    mockOnline = false;
    initOfflineMutationReplay();
    expect(queue()[0].status).toBe("pending");
    mockOnline = true;
    await drain();
    expect(starMock).toHaveBeenCalledWith({ id: "s1" });
    expect(queue()).toHaveLength(0);
  });
});
