let mockCarConnected = false;
const mockCarListeners = new Set<(connected: boolean) => void>();
const emitCarConnection = (connected: boolean) => {
  mockCarConnected = connected;
  for (const listener of [...mockCarListeners]) listener(connected);
};
const mockHeadlessTasks = new Map<
  string,
  () => (data: unknown) => Promise<void>
>();
const mockListeners: Record<string, (...args: never[]) => unknown> = {};
const mockNative = {
  setChildren: jest.fn(),
  invalidateChildren: jest.fn(),
  clearChildren: jest.fn(),
  setSearchResults: jest.fn(),
  answerAction: jest.fn(),
  setError: jest.fn(),
  notifyReady: jest.fn(),
  clearArtworkCache: jest.fn(),
};
const mockGetChildren = jest.fn();
const mockPlayMediaId = jest.fn();
const mockPlayFromSearch = jest.fn();
const mockRunItemAction = jest.fn();
const mockPushAll = jest.fn();
const mockPushError = jest.fn();
const mockQueueOffset = jest.fn(() => 0);
const mockSetCurrentIndex = jest.fn();
const mockPlay = jest.fn();
const mockSavePlaybackPosition = jest.fn();
const mockFlushPlayQueue = jest.fn();
const mockInitPlayQueueSync = jest.fn(async () => {});
let mockQueue: { id: string }[] = [];
let mockScope = "scope";
let mockAuthenticated = true;
let mockAuthListener: ((state: object, prev: object) => void) | undefined;
let mockAbsListener: ((state: object, prev: object) => void) | undefined;
const mockInvalidateListings = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppRegistry: {
    registerHeadlessTask: (
      key: string,
      provider: () => (data: unknown) => Promise<void>,
    ) => mockHeadlessTasks.set(key, provider),
  },
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { language: "en", on: jest.fn(), t: (key: string) => key },
}));

const listen =
  (name: string) =>
  (handler: (...args: never[]) => unknown): (() => void) => {
    if (mockNative.notifyReady.mock.calls.length > 0) {
      throw new Error(`${name} listener registered after notifyReady`);
    }
    mockListeners[name] = handler;
    return () => {};
  };

jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: {
    available: true,
    setVerbose: jest.fn(),
    setChildren: (...args: unknown[]) => mockNative.setChildren(...args),
    invalidateChildren: (...args: unknown[]) =>
      mockNative.invalidateChildren(...args),
    clearChildren: () => mockNative.clearChildren(),
    setSearchResults: (...args: unknown[]) =>
      mockNative.setSearchResults(...args),
    answerAction: (...args: unknown[]) => mockNative.answerAction(...args),
    setError: (...args: unknown[]) => mockNative.setError(...args),
    clearArtworkCache: () => mockNative.clearArtworkCache(),
    notifyReady: () => mockNative.notifyReady(),
    isCarConnected: () => mockCarConnected,
    delay: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    onCarConnection: (listener: (connected: boolean) => void) => {
      mockCarListeners.add(listener);
      return () => mockCarListeners.delete(listener);
    },
    onChildrenRequest: listen("children"),
    onSearchRequest: listen("search"),
    onPlay: listen("play"),
    onPlaySearch: listen("playSearch"),
    onItemAction: listen("itemAction"),
    onTransport: listen("transport"),
  },
}));
jest.mock("@/services/carAuto/connection", () => ({
  isCarConnected: () => mockCarConnected,
  subscribeCarConnection: (listener: (connected: boolean) => void) => {
    mockCarListeners.add(listener);
    return () => mockCarListeners.delete(listener);
  },
}));
jest.mock("@/services/carAuto/carplay", () => ({
  setupCarPlay: jest.fn(),
  refreshCarPlay: jest.fn(),
}));
jest.mock("@/services/carAuto/labels", () => ({ startLabels: jest.fn() }));
jest.mock("@/services/carAuto/artwork", () => ({
  startArtworkHeaders: jest.fn(),
}));
jest.mock("@/services/carAuto/nowPlaying", () => ({
  pushAll: () => mockPushAll(),
  pushError: (force?: boolean) => mockPushError(force),
  queueOffset: () => mockQueueOffset(),
  startPlaybackMirror: jest.fn(),
}));
jest.mock("@/services/carAuto/browse", () => ({
  getChildren: (...args: unknown[]) => mockGetChildren(...args),
  cachedListing: (parentId: string) =>
    parentId === "album:a1" ||
    parentId === "favorites:songs" ||
    parentId === "search:cached"
      ? { nodes: [{ id: "patched" }] }
      : undefined,
  clearListings: jest.fn(),
  invalidateListings: (matches: (parentId: string) => boolean) =>
    mockInvalidateListings(matches),
  putListing: jest.fn(),
}));
jest.mock("@/services/carAuto/play", () => ({
  playMediaId: (...args: unknown[]) => mockPlayMediaId(...args),
}));
jest.mock("@/services/carAuto/voice", () => ({
  playFromSearch: (...args: unknown[]) => mockPlayFromSearch(...args),
}));
jest.mock("@/services/carAuto/actions", () => ({
  runItemAction: (...args: unknown[]) => mockRunItemAction(...args),
  radioFromCurrentTrack: jest.fn(async () => true),
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => true,
  subscribeEffectiveOnline: jest.fn(),
}));
jest.mock("@/services/player", () => ({
  configurePlayback: jest.fn(async () => {}),
  pause: jest.fn(),
  play: () => mockPlay(),
  savePlaybackPosition: () => mockSavePlaybackPosition(),
  seekBy: jest.fn(),
  seekTo: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  toggleCurrentTrackFavorite: jest.fn(),
  togglePlayPause: jest.fn(),
}));
jest.mock("@/services/playQueueSync", () => ({
  flushPlayQueue: () => mockFlushPlayQueue(),
  initPlayQueueSync: () => mockInitPlayQueueSync(),
}));
jest.mock("@/services/startupHydration", () => ({
  applyStartupLocale: jest.fn(),
  hydratePlaybackStores: jest.fn(async () => {}),
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope,
  registerLogoutHandler: jest.fn(),
  useAuthBase: {
    getState: () => ({ isAuthenticated: mockAuthenticated }),
    subscribe: (listener: (state: object, prev: object) => void) => {
      mockAuthListener = listener;
    },
  },
}));
jest.mock("@/stores/audiobookshelf", () => ({
  useAudiobookshelfBase: {
    subscribe: (listener: (state: object, prev: object) => void) => {
      mockAbsListener = listener;
    },
  },
}));
jest.mock("@/stores/carAuto", () => ({
  useCarAutoBase: { subscribe: jest.fn() },
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { subscribe: jest.fn() },
}));
jest.mock("@/stores/podcasts", () => ({
  __esModule: true,
  default: { subscribe: jest.fn() },
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { subscribe: jest.fn() },
}));
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      queue: mockQueue,
      setCurrentIndex: mockSetCurrentIndex,
    }),
  },
}));

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const startSession = async () => {
  jest.isolateModules(() => {
    require("@/services/carAuto/session").startCarAutoSession();
  });
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockCarConnected = false;
  mockCarListeners.clear();
  mockHeadlessTasks.clear();
  for (const fn of Object.values(mockNative)) fn.mockReset();
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockGetChildren.mockReset();
  mockPlayMediaId.mockReset();
  mockPlayFromSearch.mockReset();
  mockRunItemAction.mockReset();
  mockPushAll.mockReset();
  mockPushError.mockReset();
  mockQueueOffset.mockReset().mockReturnValue(0);
  mockSetCurrentIndex.mockReset();
  mockPlay.mockReset();
  mockSavePlaybackPosition.mockReset();
  mockFlushPlayQueue.mockReset();
  mockInitPlayQueueSync.mockClear();
  mockQueue = [];
  mockScope = "scope";
  mockAuthenticated = true;
  mockAuthListener = undefined;
  mockInvalidateListings.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("boot", () => {
  it("registers every car listener before telling native it is ready", async () => {
    await startSession();

    expect(mockNative.notifyReady).toHaveBeenCalledTimes(1);
    for (const name of [
      "children",
      "search",
      "play",
      "playSearch",
      "itemAction",
      "transport",
    ]) {
      expect(mockListeners[name]).toBeDefined();
    }
  });

  it("prefetches the root and each tab when a car is connected at boot", async () => {
    mockCarConnected = true;
    mockGetChildren.mockImplementation(async (parentId: string) =>
      parentId === "root"
        ? [{ id: "section:home" }, { id: "section:library" }]
        : [],
    );

    await startSession();

    expect(mockNative.invalidateChildren).toHaveBeenCalledWith(null);
    expect(mockPushAll).toHaveBeenCalled();
    expect(mockNative.setChildren).toHaveBeenCalledWith("root", [
      { id: "section:home" },
      { id: "section:library" },
    ]);
    expect(mockGetChildren).toHaveBeenCalledWith("section:home", {
      fresh: false,
    });
    expect(mockGetChildren).toHaveBeenCalledWith("section:library", {
      fresh: false,
    });
  });

  it("does no browse work while no car is connected", async () => {
    await startSession();

    expect(mockGetChildren).not.toHaveBeenCalled();
  });

  it("holds the timer task until the car disconnects", async () => {
    mockCarConnected = true;
    mockGetChildren.mockResolvedValue([]);
    await startSession();
    const task = mockHeadlessTasks.get("WavioCarSession");

    let settled = false;
    void task?.()({}).then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    emitCarConnection(false);
    await flush();
    expect(settled).toBe(true);
  });

  it("saves the position and pushes the queue when the car disconnects", async () => {
    mockCarConnected = true;
    mockGetChildren.mockResolvedValue([]);
    await startSession();
    expect(mockSavePlaybackPosition).not.toHaveBeenCalled();
    expect(mockFlushPlayQueue).not.toHaveBeenCalled();

    emitCarConnection(false);

    expect(mockSavePlaybackPosition).toHaveBeenCalledTimes(1);
    expect(mockFlushPlayQueue).toHaveBeenCalledTimes(1);
  });

  // Nothing under app/ mounts on a headless boot to start it (issue #285).
  it("starts queue sync once a car connects, not at boot", async () => {
    mockGetChildren.mockResolvedValue([]);
    await startSession();
    expect(mockInitPlayQueueSync).not.toHaveBeenCalled();

    emitCarConnection(true);
    expect(mockInitPlayQueueSync).toHaveBeenCalledTimes(1);
  });

  it("leaves queue sync off for a signed-out car", async () => {
    mockAuthenticated = false;
    mockCarConnected = true;
    mockGetChildren.mockResolvedValue([]);
    await startSession();
    expect(mockInitPlayQueueSync).not.toHaveBeenCalled();
  });
});

describe("requests from the car", () => {
  it("answers a children request with the browse engine's listing", async () => {
    const nodes = [{ id: "track|album:a1|s1" }];
    mockGetChildren.mockResolvedValue(nodes);
    await startSession();

    mockListeners.children("album:a1" as never);
    await flush();

    expect(mockNative.setChildren).toHaveBeenCalledWith("album:a1", nodes);
  });

  it.each([true, false])(
    "re-sends the whole mirror after a tap (played: %s)",
    async (played) => {
      mockPlayMediaId.mockResolvedValue(played);
      await startSession();

      mockListeners.play("album:a1" as never);
      await flush();

      expect(mockPushAll).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a voice request that found nothing as a transient error", async () => {
    mockPlayFromSearch.mockResolvedValue(false);
    await startSession();

    mockListeners.playSearch({ query: "nothing" } as never);
    await flush();

    expect(mockNative.setError).toHaveBeenCalledWith(
      expect.objectContaining({ transient: true }),
    );
  });

  it("clears the error once a voice request plays", async () => {
    mockPlayFromSearch.mockResolvedValue(true);
    await startSession();

    mockListeners.playSearch({ query: "water", artist: "Bicep" } as never);
    await flush();

    expect(mockPlayFromSearch).toHaveBeenCalledWith("water", {
      artist: "Bicep",
    });
    expect(mockPushError).toHaveBeenCalledWith(true);
    expect(mockNative.setError).not.toHaveBeenCalled();
  });

  it("re-pushes changed parents and asks the host to refresh the item", async () => {
    mockRunItemAction.mockResolvedValue({
      ok: true,
      message: "done",
      changedParents: ["album:a1"],
    });
    await startSession();

    mockListeners.itemAction(7 as never, "favoriteAdd" as never, "x" as never);
    await flush();

    expect(mockNative.setChildren).toHaveBeenCalledWith("album:a1", [
      { id: "patched" },
    ]);
    expect(mockNative.answerAction).toHaveBeenCalledWith(7, {
      ok: true,
      message: "done",
      refreshItem: "x",
      showPlaying: undefined,
    });
  });

  it("refetches the listings an action made stale instead of patching them", async () => {
    mockCarConnected = true;
    mockGetChildren.mockResolvedValue([]);
    mockRunItemAction.mockResolvedValue({
      ok: true,
      changedParents: ["favorites:songs"],
      staleParents: ["favorites:songs", "favorites:albums"],
    });
    await startSession();
    mockNative.setChildren.mockClear();
    mockGetChildren.mockClear();
    mockGetChildren.mockResolvedValue([{ id: "refetched" }]);

    mockListeners.itemAction(
      8 as never,
      "favoriteRemove" as never,
      "x" as never,
    );
    await flush();

    expect(mockNative.invalidateChildren).toHaveBeenCalledWith([
      "favorites:songs",
      "favorites:albums",
    ]);
    expect(mockGetChildren).toHaveBeenCalledTimes(1);
    expect(mockGetChildren).toHaveBeenCalledWith("favorites:songs", {
      fresh: true,
    });
    expect(mockNative.setChildren).toHaveBeenCalledTimes(1);
    expect(mockNative.setChildren).toHaveBeenCalledWith("favorites:songs", [
      { id: "refetched" },
    ]);
    expect(mockNative.answerAction).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ refreshItem: undefined }),
    );
  });

  it("purges what native holds when the account changes", async () => {
    await startSession();

    mockScope = "other";
    mockAuthListener?.({ isAuthenticated: true }, { isAuthenticated: true });

    expect(mockNative.clearChildren).toHaveBeenCalledTimes(1);
    expect(mockNative.invalidateChildren).not.toHaveBeenCalled();
  });

  it("maps a queue tap in the windowed queue back to the real index", async () => {
    mockQueue = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}` }));
    mockQueueOffset.mockReturnValue(30);
    await startSession();

    mockListeners.transport({ action: "seekToIndex", value: 5 } as never);

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(35);
    expect(mockPlay).toHaveBeenCalled();
  });
});

describe("library refreshes", () => {
  it("offers Audiobooks as soon as an Audiobookshelf server signs in", async () => {
    mockCarConnected = true;
    mockGetChildren.mockResolvedValue([]);
    await startSession();
    mockGetChildren.mockClear();

    const signedOut = { isConnected: false, serverUrl: "", libraryId: null };
    mockAbsListener?.(
      { ...signedOut, isConnected: true, serverUrl: "http://abs" },
      signedOut,
    );
    await jest.advanceTimersByTimeAsync(1500);

    expect(mockNative.invalidateChildren).toHaveBeenCalledWith([
      "root",
      "section:library",
    ]);
    expect(mockGetChildren).toHaveBeenCalledWith("section:library", {
      fresh: true,
    });
  });
});

describe("search", () => {
  const search = (query: string) =>
    (mockListeners.search as (query: string) => Promise<void>)(query);

  it("only sends the query the driver stopped typing at to the server", async () => {
    mockGetChildren.mockResolvedValue([{ id: "hit" }]);
    await startSession();

    const typed = ["w", "wa", "wat"].map(search);
    await jest.advanceTimersByTimeAsync(400);
    await Promise.all(typed);

    expect(mockGetChildren).toHaveBeenCalledTimes(1);
    expect(mockGetChildren).toHaveBeenCalledWith("search:wat");
    expect(mockNative.setSearchResults).toHaveBeenCalledWith("w", []);
    expect(mockNative.setSearchResults).toHaveBeenCalledWith("wa", []);
    expect(mockNative.setSearchResults).toHaveBeenCalledWith("wat", [
      { id: "hit" },
    ]);
  });

  it("answers a query it already holds without waiting", async () => {
    mockGetChildren.mockResolvedValue([{ id: "hit" }]);
    await startSession();

    await search("cached");

    expect(mockGetChildren).toHaveBeenCalledWith("search:cached");
    expect(mockNative.setSearchResults).toHaveBeenCalledWith("cached", [
      { id: "hit" },
    ]);
  });
});
