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
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

const mockStatusJukebox = jest.fn();
const mockGetJukebox = jest.fn();
const mockSkipJukebox = jest.fn();
jest.mock("@/services/backend/jukebox", () => ({
  addJukebox: jest.fn(),
  clearJukebox: jest.fn(),
  getJukebox: () => mockGetJukebox(),
  setGainJukebox: jest.fn(),
  setJukebox: jest.fn(),
  skipJukebox: (index: number, offset?: number) =>
    mockSkipJukebox(index, offset),
  startJukebox: jest.fn(),
  statusJukebox: () => mockStatusJukebox(),
  stopJukebox: jest.fn(),
}));

const mockRestoreServerQueue = jest.fn();
jest.mock("@/services/player", () => ({
  restoreServerQueue: (...args: unknown[]) => mockRestoreServerQueue(...args),
}));

jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => ({ id: child.id, url: "u" }),
}));

type MockQueue = {
  queue: { id: string }[];
  currentIndex: number | null;
  setCurrentIndex: jest.Mock;
  next: jest.Mock;
  previous: jest.Mock;
  clearQueue: jest.Mock;
};
const mockQueueState: MockQueue = {
  queue: [],
  currentIndex: 0,
  setCurrentIndex: jest.fn(),
  next: jest.fn(),
  previous: jest.fn(),
  clearQueue: jest.fn(),
};
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => mockQueueState },
}));

import {
  jukeboxReconcileFromServer,
  jukeboxRefreshStatus,
  jukeboxSkipNext,
  jukeboxSkipPrevious,
} from "@/services/jukebox";
import type { JukeboxStatus } from "@/services/openSubsonic/types";
import useJukebox from "@/stores/jukebox";

const status = (currentIndex: number): { jukeboxStatus: JukeboxStatus } => ({
  jukeboxStatus: { currentIndex, gain: 0.5, playing: true, position: 0 },
});

beforeEach(() => {
  mockStatusJukebox.mockReset();
  mockGetJukebox.mockReset();
  mockSkipJukebox.mockReset().mockResolvedValue(undefined);
  mockRestoreServerQueue.mockReset();
  mockQueueState.queue = [];
  mockQueueState.currentIndex = 0;
  mockQueueState.setCurrentIndex = jest.fn();
  mockQueueState.next = jest.fn();
  mockQueueState.previous = jest.fn();
  mockQueueState.clearQueue = jest.fn();
  mockStatusJukebox.mockResolvedValue(status(0));
  useJukebox.setState(
    { active: false, status: null, gain: 0.5, pendingResume: false },
    false,
  );
});

describe("jukebox service - refreshStatus reconciliation", () => {
  test("stores the latest server status", async () => {
    mockStatusJukebox.mockResolvedValue(status(3));
    await jukeboxRefreshStatus();
    expect(useJukebox.getState().status?.currentIndex).toBe(3);
  });

  test("reconciles the local queue index when the server advanced", async () => {
    mockQueueState.currentIndex = 0;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(2);
  });

  test("does not touch the queue when indexes already match", async () => {
    mockQueueState.currentIndex = 2;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });

  test("swallows transient status errors without throwing", async () => {
    mockStatusJukebox.mockRejectedValue(new Error("network"));
    await expect(jukeboxRefreshStatus()).resolves.toBeUndefined();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });
});

describe("jukebox service - skip uses the post-advance index", () => {
  test("skipNext skips to the index after next() ran", async () => {
    mockQueueState.currentIndex = 0;
    mockQueueState.next = jest.fn(() => {
      mockQueueState.currentIndex = 1;
    });
    await jukeboxSkipNext();
    expect(mockQueueState.next).toHaveBeenCalled();
    expect(mockSkipJukebox).toHaveBeenCalledWith(1, 0);
  });

  test("skipPrevious skips to the index after previous() ran", async () => {
    mockQueueState.currentIndex = 2;
    mockQueueState.previous = jest.fn(() => {
      mockQueueState.currentIndex = 1;
    });
    await jukeboxSkipPrevious();
    expect(mockQueueState.previous).toHaveBeenCalled();
    expect(mockSkipJukebox).toHaveBeenCalledWith(1, 0);
  });
});

describe("jukebox service - reconcileFromServer", () => {
  const playlist = (
    ids: string[],
    currentIndex: number,
  ): { jukeboxPlaylist: JukeboxStatus & { entry: { id: string }[] } } => ({
    jukeboxPlaylist: {
      currentIndex,
      gain: 0.5,
      playing: true,
      position: 7,
      entry: ids.map((id) => ({ id })),
    },
  });

  test("rebuilds the local queue when the server playlist differs", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockGetJukebox.mockResolvedValue(playlist(["a", "b", "c"], 2));
    await jukeboxReconcileFromServer();
    expect(mockRestoreServerQueue).toHaveBeenCalledWith(
      [
        { id: "a", url: "u" },
        { id: "b", url: "u" },
        { id: "c", url: "u" },
      ],
      2,
      7,
    );
  });

  test("only reconciles the index when the playlist matches", async () => {
    mockQueueState.queue = [{ id: "a" }, { id: "b" }];
    mockQueueState.currentIndex = 0;
    mockGetJukebox.mockResolvedValue(playlist(["a", "b"], 1));
    await jukeboxReconcileFromServer();
    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(1);
  });

  test("clears the local queue when the server playlist is empty", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockGetJukebox.mockResolvedValue(playlist([], 0));
    await jukeboxReconcileFromServer();
    expect(mockQueueState.clearQueue).toHaveBeenCalled();
    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
  });

  test("swallows transient errors without throwing", async () => {
    mockGetJukebox.mockRejectedValue(new Error("network"));
    await expect(jukeboxReconcileFromServer()).resolves.toBeUndefined();
  });
});
