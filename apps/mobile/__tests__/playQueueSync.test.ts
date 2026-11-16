// Issue #285: a queue played from the car has to reach the server, and the
// server's older queue must never replace one that was played meanwhile.
import { createStore } from "zustand/vanilla";

type Track = { id: string };
type QueueState = { queue: Track[]; currentIndex: number | null };

const makeQueueStore = () =>
  createStore<QueueState>(() => ({
    queue: [{ id: "local" }],
    currentIndex: 0,
  }));
// Fresh per test: every re-required module instance subscribes at load.
let mockQueueStore = makeQueueStore();
let mockHydrated = true;
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueStore.getState(),
    subscribe: (
      listener: (state: QueueState, prev: QueueState) => void,
    ): (() => void) => mockQueueStore.subscribe(listener),
    persist: { hasHydrated: () => mockHydrated },
  },
}));

// Device storage outlives a process: re-requiring the module is a restart.
const mockLedger = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  getNoBackupStorage: () => ({
    set: (k: string, v: string) => mockLedger.set(k, v),
    getString: (k: string) => mockLedger.get(k),
  }),
}));

// network.ts, not React Query's onlineManager: a headless car boot never wires
// the latter to connectivity.
let mockOnline = true;
const mockOnlineListeners = new Set<() => void>();
const setOnline = (online: boolean) => {
  mockOnline = online;
  for (const listener of mockOnlineListeners) listener();
};
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
  subscribeEffectiveOnline: (listener: () => void) => {
    mockOnlineListeners.add(listener);
    return () => mockOnlineListeners.delete(listener);
  },
}));

const mockGetPlayQueue = jest.fn();
const mockSavePlayQueue = jest.fn(async (_: unknown) => ({}));
jest.mock("@/services/backend/bookmarks", () => ({
  getPlayQueue: () => mockGetPlayQueue(),
  savePlayQueue: (args: unknown) => mockSavePlayQueue(args),
}));
jest.mock("@/services/backend/capabilities", () => ({
  getCapabilities: () => ({ playQueueSync: true }),
}));
jest.mock("@/services/backgroundTimer", () => ({
  setBackgroundTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearBackgroundTimer: (timer: ReturnType<typeof setTimeout>) =>
    clearTimeout(timer),
}));

let mockPlaying = false;
const mockRestoreServerQueue = jest.fn((tracks: Track[], index: number) => {
  mockQueueStore.setState({ queue: tracks, currentIndex: index });
});
jest.mock("@/services/player", () => ({
  isPlaying: () => mockPlaying,
  getCurrentTime: () => 42,
  restoreServerQueue: (tracks: Track[], index: number) =>
    mockRestoreServerQueue(tracks, index),
}));

let mockPriority = "server";
jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => ({ queueSyncPriority: mockPriority }) },
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: { getState: () => ({ serverType: "navidrome" }) },
}));
jest.mock("@/stores/jukebox", () => ({
  __esModule: true,
  default: { getState: () => ({ active: false }) },
}));
jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => ({ id: child.id }),
}));

import type * as PlayQueueSync from "@/services/playQueueSync";

let sync: typeof PlayQueueSync;

const tracks = (...ids: string[]) => ids.map((id) => ({ id }));

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const serverQueue = {
  playQueue: { entry: tracks("old1", "old2"), current: "old1", position: 0 },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockOnline = true;
  mockOnlineListeners.clear();
  mockPlaying = false;
  mockPriority = "server";
  mockQueueStore = makeQueueStore();
  mockHydrated = true;
  mockLedger.clear();
  mockGetPlayQueue.mockReset();
  mockSavePlayQueue.mockClear();
  mockRestoreServerQueue.mockClear();
  jest.isolateModules(() => {
    sync = require("@/services/playQueueSync");
  });
});

afterEach(() => {
  sync.stopPlayQueueSync();
  jest.useRealTimers();
});

describe("restore at startup", () => {
  test("replaces the local queue with the server's when nothing happened meanwhile", async () => {
    mockGetPlayQueue.mockResolvedValue(serverQueue);
    await sync.initPlayQueueSync();
    expect(mockRestoreServerQueue).toHaveBeenCalledTimes(1);
  });

  test("stands down when the car played something while the server answered", async () => {
    const response = deferred<typeof serverQueue>();
    mockGetPlayQueue.mockReturnValue(response.promise);
    const init = sync.initPlayQueueSync();

    mockQueueStore.setState({ queue: tracks("car1", "car2"), currentIndex: 0 });
    response.resolve(serverQueue);
    await init;

    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    expect(mockQueueStore.getState().queue).toEqual(tracks("car1", "car2"));
    // The car's queue changed before the push subscription existed, so it is
    // pushed explicitly.
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["car1", "car2"], current: "car1" }),
    );
  });

  test("stands down when playback started while the server answered", async () => {
    const response = deferred<typeof serverQueue>();
    mockGetPlayQueue.mockReturnValue(response.promise);
    const init = sync.initPlayQueueSync();

    mockPlaying = true;
    response.resolve(serverQueue);
    await init;

    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
  });

  test("pushes the local queue when playback started while the server answered", async () => {
    const response = deferred<typeof serverQueue>();
    mockGetPlayQueue.mockReturnValue(response.promise);
    const init = sync.initPlayQueueSync();

    mockPlaying = true;
    response.resolve(serverQueue);
    await init;

    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["local"], current: "local" }),
    );
  });

  test("leaves a server switch made during the restore alone", async () => {
    const response = deferred<typeof serverQueue>();
    mockGetPlayQueue.mockReturnValue(response.promise);
    const init = sync.initPlayQueueSync();

    sync.stopPlayQueueSync();
    response.resolve(serverQueue);
    await init;

    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    mockQueueStore.setState({ queue: tracks("b"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).not.toHaveBeenCalled();
    expect(mockOnlineListeners.size).toBe(0);
  });

  test("starts once however many entry points ask", async () => {
    mockGetPlayQueue.mockResolvedValue(serverQueue);
    await Promise.all([sync.initPlayQueueSync(), sync.initPlayQueueSync()]);
    expect(mockGetPlayQueue).toHaveBeenCalledTimes(1);
  });
});

describe("pushes", () => {
  beforeEach(() => {
    mockPriority = "local";
  });

  test("pushes a change after the debounce", async () => {
    await sync.initPlayQueueSync();
    mockQueueStore.setState({ queue: tracks("a", "b"), currentIndex: 1 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledWith({
      ids: ["a", "b"],
      current: "b",
      position: 42,
    });
  });

  test("pushes a change made offline once the server is back", async () => {
    await sync.initPlayQueueSync();
    setOnline(false);
    mockQueueStore.setState({ queue: tracks("a", "b"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).not.toHaveBeenCalled();

    setOnline(true);
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["a", "b"] }),
    );
  });

  test("retries a push the server refused once it is reachable again", async () => {
    await sync.initPlayQueueSync();
    mockSavePlayQueue.mockRejectedValueOnce(new Error("down"));
    mockQueueStore.setState({ queue: tracks("a"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(1);

    setOnline(false);
    setOnline(true);
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(2);
  });

  test("retries a refused push on its own when reachability never changes", async () => {
    await sync.initPlayQueueSync();
    mockSavePlayQueue.mockRejectedValueOnce(new Error("down"));
    mockQueueStore.setState({ queue: tracks("a"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(2);
  });

  test("does not push an identical queue a rehydrate re-parsed", async () => {
    // The stored queue lands while the store reports not hydrated.
    mockHydrated = false;
    mockQueueStore.setState({ queue: tracks("a", "b"), currentIndex: 1 });
    mockHydrated = true;
    await sync.initPlayQueueSync();
    mockQueueStore.setState({ queue: tracks("a", "b"), currentIndex: 1 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).not.toHaveBeenCalled();
  });

  test("does not push again on reconnect when nothing is pending", async () => {
    await sync.initPlayQueueSync();
    mockQueueStore.setState({ queue: tracks("a"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(1);

    setOnline(false);
    setOnline(true);
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(1);
  });
});

// A restart: the queue and device storage survive, the module state doesn't.
const restart = () => {
  sync.stopPlayQueueSync();
  jest.isolateModules(() => {
    sync = require("@/services/playQueueSync");
  });
};

// Navidrome's format, nanoseconds included.
const serverTime = (ms: number) =>
  new Date(ms).toISOString().replace(/Z$/, "123456Z");

const serverQueueAt = (ms: number) => ({
  playQueue: { ...serverQueue.playQueue, changed: serverTime(ms) },
});

describe("most recent queue wins", () => {
  test("keeps a queue changed offline in an earlier run that never reached the server", async () => {
    mockPriority = "local";
    await sync.initPlayQueueSync();
    const serverSavedAt = Date.now() - 60_000;
    setOnline(false);
    mockQueueStore.setState({ queue: tracks("car1", "car2"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).not.toHaveBeenCalled();

    restart();
    mockPriority = "server";
    setOnline(true);
    mockGetPlayQueue.mockResolvedValue(serverQueueAt(serverSavedAt));
    await sync.initPlayQueueSync();

    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["car1", "car2"] }),
    );
  });

  test("restores a server queue saved after the local change", async () => {
    mockPriority = "local";
    await sync.initPlayQueueSync();
    setOnline(false);
    mockQueueStore.setState({ queue: tracks("car1"), currentIndex: 0 });

    restart();
    mockPriority = "server";
    setOnline(true);
    // Another device saved its queue after this one changed offline.
    mockGetPlayQueue.mockResolvedValue(serverQueueAt(Date.now() + 60_000));
    await sync.initPlayQueueSync();

    expect(mockRestoreServerQueue).toHaveBeenCalledTimes(1);
  });

  test("never lets a synced queue beat the server's, whatever the clocks say", async () => {
    mockPriority = "local";
    await sync.initPlayQueueSync();
    mockQueueStore.setState({ queue: tracks("a"), currentIndex: 0 });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(mockSavePlayQueue).toHaveBeenCalledTimes(1);

    restart();
    mockPriority = "server";
    // A server clock behind this device's would make the local change look
    // newer; it is on the server already, so the server's queue stands.
    mockGetPlayQueue.mockResolvedValue(serverQueueAt(Date.now() - 3_600_000));
    await sync.initPlayQueueSync();

    expect(mockRestoreServerQueue).toHaveBeenCalledTimes(1);
  });

  test("does not count restoring the stored queue at launch as a change", async () => {
    mockHydrated = false;
    mockQueueStore.setState({ queue: tracks("stored"), currentIndex: 0 });
    mockHydrated = true;
    // The app's own rehydrate re-parses the same queue into new arrays.
    mockQueueStore.setState({ queue: tracks("stored"), currentIndex: 0 });

    mockGetPlayQueue.mockResolvedValue(serverQueueAt(Date.now() - 60_000));
    await sync.initPlayQueueSync();

    expect(mockRestoreServerQueue).toHaveBeenCalledTimes(1);
  });
});
