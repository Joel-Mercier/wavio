// Building the car browse tree is a burst of server requests and hundreds of
// cover downloads. It used to run on every launch, car or not (issue #205);
// now it runs only while a car host is connected, and so does the 1 s
// position pulse. The headless task registered here is what native holds to
// keep JS timers running while the phone UI is in the background.

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
let mockAuthListener: (() => void) | null = null;
const mockBuild = jest.fn();
const mockSetPlaybackState = jest.fn();
const mockSetChildren = jest.fn();
const mockNotifyReady = jest.fn();
const mockLoadOnDemandChildren = jest.fn();
let mockChildrenListener: ((parentId: string) => void) | null = null;
let mockCurrentFavorite: boolean | null = null;
let mockFavoriteListener: ((favorite: boolean | null) => void) | null = null;
const mockSetFavorite = jest.fn();
const mockToggleFavorite = jest.fn();
const mockTogglePlayPause = jest.fn();
let mockTransportListener: ((event: { action: string }) => void) | null = null;
type MockCarButtons = {
  showCarFavoriteButton: boolean;
  showCarShuffleButton: boolean;
  showCarRepeatButton: boolean;
};
let mockCarButtons: MockCarButtons = {
  showCarFavoriteButton: true,
  showCarShuffleButton: true,
  showCarRepeatButton: true,
};
let mockAppListener:
  | ((state: MockCarButtons, prev: MockCarButtons) => void)
  | null = null;
const mockSetButtons = jest.fn();

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
jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => ({ playing: false, currentTime: 0 }),
  subscribePlaybackState: jest.fn(),
}));
jest.mock("@/services/backend/serverTraits", () => ({
  hasNetworkServerType: () => true,
}));
jest.mock("@/services/carAuto/artworkMirror", () => ({
  cachedCarArtwork: () => undefined,
  clearCarArtworkCache: jest.fn(),
  ensureCarArtwork: jest.fn(async () => undefined),
  refreshCarArtworkIndex: jest.fn(),
}));
jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: {
    available: true,
    setVerbose: jest.fn(),
    notifyReady: () => mockNotifyReady(),
    setNodes: jest.fn(),
    setChildren: (parentId: string, nodes: unknown) =>
      mockSetChildren(parentId, nodes),
    onChildrenRequest: (listener: (parentId: string) => void) => {
      // Native only emits once notifyReady has marked JS ready.
      if (mockNotifyReady.mock.calls.length > 0) {
        throw new Error("children listener registered after notifyReady");
      }
      mockChildrenListener = listener;
      return () => {};
    },
    setNowPlaying: jest.fn(),
    setQueue: jest.fn(),
    setQueueIndex: jest.fn(),
    setPlaybackState: (state: unknown) => mockSetPlaybackState(state),
    setFavorite: (favorite: boolean | null) => mockSetFavorite(favorite),
    setButtons: (buttons: unknown) => mockSetButtons(buttons),
    isCarConnected: () => mockCarConnected,
    delay: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    onCarConnection: (listener: (connected: boolean) => void) => {
      mockCarListeners.add(listener);
      return () => mockCarListeners.delete(listener);
    },
    onPlay: jest.fn(),
    onTransport: (listener: (event: { action: string }) => void) => {
      mockTransportListener = listener;
      return () => {};
    },
  },
}));
jest.mock("@/services/carAuto/carplay", () => ({
  isCarPlayConnected: () => false,
  onCarPlayConnection: () => () => {},
  setupCarPlay: jest.fn(),
  updateCarPlayTree: jest.fn(),
}));
jest.mock("@/services/carAuto/play", () => ({ handleBrowsePlay: jest.fn() }));
jest.mock("@/services/carAuto/tree", () => ({
  buildBrowseTree: () => mockBuild(),
  loadOnDemandChildren: (parentId: string) =>
    mockLoadOnDemandChildren(parentId),
  getSnapshot: () => ({
    tracks: new Map([["t", {}]]),
    albums: new Map(),
    playlists: new Map(),
  }),
  localizeTreeArtwork: jest.fn(async () => false),
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => true,
  subscribeEffectiveOnline: jest.fn(),
}));
jest.mock("@/services/player", () => ({
  configurePlayback: jest.fn(async () => {}),
  getCurrentFavorite: () => mockCurrentFavorite,
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  subscribeCurrentFavorite: (listener: (favorite: boolean | null) => void) => {
    mockFavoriteListener = listener;
    return () => {};
  },
  toggleCurrentTrackFavorite: () => mockToggleFavorite(),
  togglePlayPause: () => mockTogglePlayPause(),
}));
jest.mock("@/services/startupHydration", () => ({
  applyStartupLocale: jest.fn(),
  hydratePlaybackStores: jest.fn(async () => {}),
}));
jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => mockCarButtons,
    subscribe: (
      listener: (state: MockCarButtons, prev: MockCarButtons) => void,
    ) => {
      mockAppListener = listener;
      return () => {};
    },
  },
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  registerLogoutHandler: jest.fn(),
  useAuthBase: {
    getState: () => ({
      isAuthenticated: true,
      url: "https://music.example.com",
      username: "joel",
      serverType: "navidrome",
    }),
    subscribe: (listener: () => void) => {
      mockAuthListener = listener;
    },
  },
}));
jest.mock("@/stores/podcasts", () => ({
  __esModule: true,
  default: { getState: () => ({}), subscribe: jest.fn() },
  podcastFavoritesForScope: () => [],
}));
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      queue: [],
      currentIndex: null,
      getCurrent: () => null,
      shuffle: false,
      repeatMode: "off",
    }),
    subscribe: jest.fn(),
  },
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { subscribe: jest.fn() },
}));

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
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
  mockAuthListener = null;
  mockBuild.mockReset();
  mockBuild.mockResolvedValue({ tree: {}, complete: true });
  mockSetPlaybackState.mockReset();
  mockSetChildren.mockReset();
  mockNotifyReady.mockReset();
  mockLoadOnDemandChildren.mockReset();
  mockChildrenListener = null;
  mockCurrentFavorite = null;
  mockFavoriteListener = null;
  mockSetFavorite.mockReset();
  mockToggleFavorite.mockReset();
  mockTogglePlayPause.mockReset();
  mockTransportListener = null;
  mockCarButtons = {
    showCarFavoriteButton: true,
    showCarShuffleButton: true,
    showCarRepeatButton: true,
  };
  mockAppListener = null;
  mockSetButtons.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("car session gating", () => {
  it("builds nothing and runs no pulse with no car connected", async () => {
    await startSession();
    mockAuthListener?.();
    mockSetPlaybackState.mockClear();
    await jest.advanceTimersByTimeAsync(5000);

    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockSetPlaybackState).not.toHaveBeenCalled();
  });

  it("builds right away when a car is already connected at boot", async () => {
    mockCarConnected = true;

    await startSession();

    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it("builds on connect without waiting on a timer", async () => {
    // A car-only boot runs with JS timers paused, so the build can't sit
    // behind the debounce.
    await startSession();
    emitCarConnection(true);
    await flush();

    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it("pulses playback state while connected and stops on disconnect", async () => {
    mockCarConnected = true;
    await startSession();
    mockSetPlaybackState.mockClear();

    await jest.advanceTimersByTimeAsync(3000);
    expect(mockSetPlaybackState).toHaveBeenCalledTimes(3);

    emitCarConnection(false);
    mockSetPlaybackState.mockClear();
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockSetPlaybackState).not.toHaveBeenCalled();
  });

  it("registers a timer-holding task that settles when the car disconnects", async () => {
    mockCarConnected = true;
    await startSession();
    const task = mockHeadlessTasks.get("WavioCarSession");
    expect(task).toBeDefined();

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

  it("settles the task at once when no car is connected by the time it runs", async () => {
    await startSession();

    await expect(
      mockHeadlessTasks.get("WavioCarSession")?.()({}),
    ).resolves.toBeUndefined();
  });
});

describe("on-demand children", () => {
  it("answers a children request with what the tree loads", async () => {
    const nodes = [{ id: "track|album:a1|s1", title: "S1", playable: true }];
    mockLoadOnDemandChildren.mockResolvedValue(nodes);
    await startSession();
    expect(mockNotifyReady).toHaveBeenCalled();

    mockChildrenListener?.("album:a1");
    await flush();

    expect(mockLoadOnDemandChildren).toHaveBeenCalledWith("album:a1");
    expect(mockSetChildren).toHaveBeenCalledWith("album:a1", nodes);
  });

  it("passes a failed load through as null", async () => {
    mockLoadOnDemandChildren.mockResolvedValue(null);
    await startSession();

    mockChildrenListener?.("album:a1");
    await flush();

    expect(mockSetChildren).toHaveBeenCalledWith("album:a1", null);
  });
});

describe("favorite button", () => {
  it("pushes the heart at boot, car or not, and every change after", async () => {
    // Native keeps it for a car that binds later, like the playback state.
    mockCurrentFavorite = false;
    await startSession();
    expect(mockSetFavorite).toHaveBeenCalledWith(false);

    mockFavoriteListener?.(true);
    expect(mockSetFavorite).toHaveBeenLastCalledWith(true);

    mockFavoriteListener?.(null);
    expect(mockSetFavorite).toHaveBeenLastCalledWith(null);
  });

  it("toggles the favorite when the car's heart is tapped", async () => {
    await startSession();

    mockTransportListener?.({ action: "favorite" });

    expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    // Actions without a case fall through to play/pause.
    expect(mockTogglePlayPause).not.toHaveBeenCalled();
  });
});

describe("player buttons setting", () => {
  it("pushes the Android Auto section's buttons at boot, car or not", async () => {
    mockCarButtons = { ...mockCarButtons, showCarShuffleButton: false };
    await startSession();

    expect(mockSetButtons).toHaveBeenCalledWith({
      favorite: true,
      shuffle: false,
      repeat: true,
    });
  });

  it("pushes again when a toggle changes, and only then", async () => {
    await startSession();
    mockSetButtons.mockClear();
    const prev = mockCarButtons;

    // Some other app setting changed.
    mockAppListener?.({ ...prev }, prev);
    expect(mockSetButtons).not.toHaveBeenCalled();

    mockCarButtons = { ...prev, showCarRepeatButton: false };
    mockAppListener?.(mockCarButtons, prev);
    expect(mockSetButtons).toHaveBeenCalledWith({
      favorite: true,
      shuffle: true,
      repeat: false,
    });
  });
});
