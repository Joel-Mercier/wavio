// The browse tree is a burst of server requests plus a few hundred cover
// mirrors. Android builds it eagerly because the native side caches it on disk
// for the next cold car session; iOS has no such cache, so building it with no
// CarPlay head unit attached is pure waste (audit A2). The session has to wait
// for a real connection on iOS and keep building at boot on Android.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const mockBuildBrowseTree = jest.fn();
const mockLocalizeTreeArtwork = jest.fn();
const mockSetupCarPlay = jest.fn();
const mockUpdateCarPlayTree = jest.fn();
const mockClearCarPlayTree = jest.fn();
let mockCarPlayConnected = false;
let mockBridgeAvailable = false;

const tree = { root: [] };

jest.mock("@/services/carAuto/tree", () => ({
  buildBrowseTree: (...args: unknown[]) => mockBuildBrowseTree(...args),
  localizeTreeArtwork: (...args: unknown[]) => mockLocalizeTreeArtwork(...args),
  getSnapshot: () => ({
    tracks: new Map([["t1", {}]]),
    albums: new Map(),
    playlists: new Map(),
  }),
}));

jest.mock("@/services/carAuto/carplay", () => ({
  isCarPlayConnected: () => mockCarPlayConnected,
  setupCarPlay: (...args: unknown[]) => mockSetupCarPlay(...args),
  updateCarPlayTree: (...args: unknown[]) => mockUpdateCarPlayTree(...args),
  clearCarPlayTree: (...args: unknown[]) => mockClearCarPlayTree(...args),
}));

jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: {
    get available() {
      return mockBridgeAvailable;
    },
    setNodes: jest.fn(),
    setNowPlaying: jest.fn(),
    setQueue: jest.fn(),
    setQueueIndex: jest.fn(),
    setPlaybackState: jest.fn(),
    notifyReady: jest.fn(),
    setVerbose: jest.fn(),
    onPlay: jest.fn(() => () => {}),
    onTransport: jest.fn(() => () => {}),
  },
}));

jest.mock("@/services/carAuto/artworkMirror", () => ({
  cachedCarArtwork: () => undefined,
  clearCarArtworkCache: jest.fn(),
  ensureCarArtwork: jest.fn(),
}));

jest.mock("@/services/carAuto/play", () => ({ handleBrowsePlay: jest.fn() }));

jest.mock("@/services/startupHydration", () => ({
  applyStartupLocale: jest.fn(),
  hydratePlaybackStores: jest.fn(async () => {}),
}));

jest.mock("@/services/player", () => ({
  configurePlayback: jest.fn(async () => {}),
  setCarPlayAttached: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  togglePlayPause: jest.fn(),
}));

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => true,
  subscribeEffectiveOnline: jest.fn(),
}));

jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => ({ playing: false, currentTime: 0 }),
  subscribePlaybackState: jest.fn(),
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { language: "en", on: jest.fn() },
}));

const store = (state: Record<string, unknown>) => ({
  getState: () => state,
  subscribe: jest.fn(),
});

const authState = {
  isAuthenticated: true,
  serverId: "s1",
  url: "https://music.example",
  username: "joel",
  serverType: "navidrome",
  useTokenAuth: true,
};
const mockAuthSubscribe = jest.fn();

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => authState,
    subscribe: (...args: unknown[]) => mockAuthSubscribe(...args),
  },
  currentAuthScope: () => "scope",
  registerLogoutHandler: jest.fn(),
}));

jest.mock("@/stores/podcasts", () => ({
  __esModule: true,
  default: store({ favoritePodcasts: [] }),
  podcastFavoritesForScope: () => [],
}));

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: store({
    queue: [],
    currentIndex: null,
    shuffle: false,
    repeatMode: "off",
    getCurrent: () => null,
  }),
}));

jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: store({ recentPlays: [] }),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  }
};

const boot = async (os: "ios" | "android") => {
  jest.resetModules();
  require("react-native").Platform.OS = os;
  const { startCarAutoSession } = require("@/services/carAuto/session");
  startCarAutoSession();
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  authState.serverId = "s1";
  authState.url = "https://music.example";
  mockCarPlayConnected = false;
  mockBridgeAvailable = false;
  mockBuildBrowseTree.mockResolvedValue({ tree, complete: true });
  mockLocalizeTreeArtwork.mockResolvedValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("car session tree build", () => {
  it("iOS: does not build the tree while no CarPlay session is attached", async () => {
    await boot("ios");

    expect(mockBuildBrowseTree).not.toHaveBeenCalled();
    expect(mockLocalizeTreeArtwork).not.toHaveBeenCalled();
    expect(mockUpdateCarPlayTree).not.toHaveBeenCalled();
    expect(mockSetupCarPlay).toHaveBeenCalledTimes(1);
  });

  it("iOS: builds and applies the tree once CarPlay connects", async () => {
    await boot("ios");
    const { onConnect } = mockSetupCarPlay.mock.calls[0][0] as {
      onConnect: () => void;
    };

    mockCarPlayConnected = true;
    onConnect();
    await flush();

    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(1);
    expect(mockUpdateCarPlayTree).toHaveBeenCalledWith(tree);
    expect(mockLocalizeTreeArtwork).toHaveBeenCalledWith(tree);
  });

  it("iOS: builds at boot when CarPlay was already connected", async () => {
    mockCarPlayConnected = true;
    await boot("ios");

    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(1);
    expect(mockUpdateCarPlayTree).toHaveBeenCalledWith(tree);
  });

  it("iOS: drops the held tree when the server changes while disconnected", async () => {
    mockCarPlayConnected = true;
    await boot("ios");
    expect(mockUpdateCarPlayTree).toHaveBeenCalledTimes(1);
    const authListener = mockAuthSubscribe.mock.calls[0][0] as () => void;

    mockCarPlayConnected = false;
    authState.serverId = "s2";
    authState.url = "https://other.example";
    authListener();
    await flush();

    expect(mockClearCarPlayTree).toHaveBeenCalledTimes(1);
    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(1);

    const { onConnect } = mockSetupCarPlay.mock.calls[0][0] as {
      onConnect: () => void;
    };
    mockCarPlayConnected = true;
    onConnect();
    await flush();

    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(2);
    expect(mockUpdateCarPlayTree).toHaveBeenCalledTimes(2);
    expect(mockClearCarPlayTree).toHaveBeenCalledTimes(1);
  });

  it("iOS: keeps the held tree across changes within the same session", async () => {
    mockCarPlayConnected = true;
    await boot("ios");
    const authListener = mockAuthSubscribe.mock.calls[0][0] as () => void;

    mockCarPlayConnected = false;
    authListener();
    await flush();

    expect(mockClearCarPlayTree).not.toHaveBeenCalled();
  });

  it("discards a build whose session changed while it was in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    mockBuildBrowseTree.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mockCarPlayConnected = true;
    await boot("ios");
    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(1);

    authState.serverId = "s2";
    authState.url = "https://other.example";
    finish({ tree, complete: true });
    await flush();

    expect(mockUpdateCarPlayTree).not.toHaveBeenCalledWith(tree);
    expect(mockLocalizeTreeArtwork).not.toHaveBeenCalled();
  });

  it("Android: builds at boot without waiting for a car", async () => {
    mockBridgeAvailable = true;
    await boot("android");

    expect(mockBuildBrowseTree).toHaveBeenCalledTimes(1);
    expect(mockSetupCarPlay).not.toHaveBeenCalled();
    expect(mockUpdateCarPlayTree).not.toHaveBeenCalled();
  });
});
