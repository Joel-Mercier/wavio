// The wear session runs from index.js, not from a React component (a headless
// Android Auto boot mounts nothing, and swiping the app away with music playing
// unmounts everything). That buys the two properties these tests pin down: it
// must not publish before the scoped stores are restored — an un-hydrated queue
// would overwrite the watch's retained state with an empty one — and starting it
// twice must not wire it twice.

import type { CommandPayload } from "@/services/wear/protocol";

type Track = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  artwork?: string;
};

const mockBridge = {
  available: true,
  putState: jest.fn(),
  putQueue: jest.fn(),
  putArtwork: jest.fn(),
  sendProgress: jest.fn(),
  clearState: jest.fn(),
  getConnectedNodes: jest.fn(),
  onCommand: jest.fn(),
  onConnection: jest.fn(),
};

let mockQueueState: {
  queue: Track[];
  currentIndex: number | null;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  getCurrent: () => Track | null;
};

const resetQueue = (tracks: Track[] = []) => {
  mockQueueState = {
    queue: tracks,
    currentIndex: tracks.length ? 0 : null,
    shuffle: false,
    repeatMode: "off",
    getCurrent: () =>
      mockQueueState.currentIndex == null
        ? null
        : (mockQueueState.queue[mockQueueState.currentIndex] ?? null),
  };
};
resetQueue();

let mockHydrate: () => Promise<void>;

jest.mock("@/services/wear/bridge", () => ({
  WearBridge: {
    get available() {
      return mockBridge.available;
    },
    putState: (...a: unknown[]) => mockBridge.putState(...a),
    putQueue: (...a: unknown[]) => mockBridge.putQueue(...a),
    putArtwork: (...a: unknown[]) => mockBridge.putArtwork(...a),
    sendProgress: (...a: unknown[]) => mockBridge.sendProgress(...a),
    clearState: (...a: unknown[]) => mockBridge.clearState(...a),
    getConnectedNodes: () => mockBridge.getConnectedNodes(),
    onCommand: (h: unknown) => mockBridge.onCommand(h),
    onConnection: (h: unknown) => mockBridge.onConnection(h),
  },
}));

jest.mock("@/services/wear/artwork", () => ({
  resolveArtworkFile: jest.fn(async () => null),
  clearArtworkCache: jest.fn(),
}));

jest.mock("@/services/startupHydration", () => ({
  hydratePlaybackStores: () => mockHydrate(),
}));

jest.mock("@/services/player", () => ({
  play: jest.fn(),
  pause: jest.fn(),
  playTracks: jest.fn(),
  seekTo: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
}));

jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => ({
    playing: true,
    currentTime: 12,
    duration: 300,
  }),
  subscribePlaybackState: jest.fn(() => () => {}),
}));

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    subscribe: jest.fn(() => () => {}),
  },
}));

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: { subscribe: jest.fn(() => () => {}) },
}));

/** Fresh module registry, so the module-level `started` guard resets. */
const loadSession = () => {
  jest.resetModules();
  return require("@/services/wear/session").startWearSession as () => void;
};

/** Lets every already-resolved promise in the wiring chain settle. */
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const song = (id: string): Track => ({ id, title: id, duration: 300 });

const lastCommandHandler = () =>
  mockBridge.onCommand.mock.calls.at(-1)?.[0] as (c: CommandPayload) => void;

beforeEach(() => {
  jest.clearAllMocks();
  mockBridge.available = true;
  mockBridge.getConnectedNodes.mockResolvedValue(["node-1"]);
  mockHydrate = async () => {};
  resetQueue([song("a"), song("b")]);
});

describe("wear session startup", () => {
  it("publishes nothing until the scoped stores are hydrated", async () => {
    let release: (() => void) | undefined;
    const hydrated = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockHydrate = () => hydrated;

    loadSession()();
    await flush();

    // Not even discovery: an empty queue must never reach the watch.
    expect(mockBridge.getConnectedNodes).not.toHaveBeenCalled();
    expect(mockBridge.putState).not.toHaveBeenCalled();
    expect(mockBridge.putQueue).not.toHaveBeenCalled();

    release?.();
    await flush();

    expect(mockBridge.putState).toHaveBeenCalledTimes(1);
    expect(mockBridge.putState.mock.calls[0][0]).toMatchObject({
      track: { id: "a" },
      isPlaying: true,
    });
    expect(mockBridge.putQueue.mock.calls[0][0]).toMatchObject({
      currentIndex: 0,
      total: 2,
      tracks: [{ id: "a" }, { id: "b" }],
    });
  });

  it("replays a command that arrived while it was still wiring", async () => {
    let release: (() => void) | undefined;
    mockHydrate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    loadSession()();
    await flush();
    // Native publishes its instance in OnCreate, so the watch can already be
    // sending — the listener has to exist before hydration, not after it.
    const player = require("@/services/player") as { play: jest.Mock };
    lastCommandHandler()({ v: 1, action: "play" });
    expect(player.play).not.toHaveBeenCalled();

    release?.();
    await flush();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("stays wired once when started twice", async () => {
    const start = loadSession();
    start();
    start();
    await flush();

    expect(mockBridge.getConnectedNodes).toHaveBeenCalledTimes(1);
    expect(mockBridge.onCommand).toHaveBeenCalledTimes(1);
    expect(mockBridge.putState).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all without the native module", async () => {
    mockBridge.available = false;
    loadSession()();
    await flush();

    expect(mockBridge.getConnectedNodes).not.toHaveBeenCalled();
    expect(mockBridge.putState).not.toHaveBeenCalled();
  });

  it("publishes nothing while no watch is reachable", async () => {
    mockBridge.getConnectedNodes.mockResolvedValue([]);
    loadSession()();
    await flush();

    expect(mockBridge.putState).not.toHaveBeenCalled();
    expect(mockBridge.putQueue).not.toHaveBeenCalled();
  });
});

describe("wear session subscription lease", () => {
  it("resyncs and ticks on subscribe, but treats a renewal as free", async () => {
    loadSession()();
    await flush();
    const command = lastCommandHandler();
    mockBridge.putState.mockClear();
    mockBridge.putQueue.mockClear();

    jest.useFakeTimers();
    try {
      command({ v: 1, action: "subscribe" });
      // A watch that just opened its player gets the truth immediately rather
      // than waiting for the next change.
      expect(mockBridge.putState).toHaveBeenCalledTimes(1);
      expect(mockBridge.putQueue).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1200);
      expect(mockBridge.sendProgress).toHaveBeenCalledTimes(2);

      mockBridge.putState.mockClear();
      mockBridge.putQueue.mockClear();
      command({ v: 1, action: "subscribe" });
      expect(mockBridge.putState).not.toHaveBeenCalled();
      expect(mockBridge.putQueue).not.toHaveBeenCalled();

      // Unsubscribing stops the traffic outright.
      command({ v: 1, action: "unsubscribe" });
      mockBridge.sendProgress.mockClear();
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockBridge.sendProgress).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("starts ticking when `hello` reveals the watch a subscribe missed", async () => {
    // The capability lookup found nothing, and the watch's `subscribe` beat its
    // `hello` — they leave MainActivity on independent coroutines.
    mockBridge.getConnectedNodes.mockResolvedValue([]);
    loadSession()();
    await flush();
    const command = lastCommandHandler();

    jest.useFakeTimers();
    try {
      command({ v: 1, action: "subscribe" });
      await jest.advanceTimersByTimeAsync(1200);
      expect(mockBridge.sendProgress).not.toHaveBeenCalled();

      command({ v: 1, action: "hello", protocolVersion: 1 });
      await jest.advanceTimersByTimeAsync(1200);
      expect(mockBridge.sendProgress).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
