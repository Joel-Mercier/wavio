const mockOrder: string[] = [];
const mockRefreshCarPlay = jest.fn();
const mockClearListings = jest.fn();
const mockRegisterHeadlessTask = jest.fn();
const mockStartPlaybackMirror = jest.fn();
const mockNotifyReady = jest.fn();
let mockLanguageListener: (() => void) | undefined;
const mockCarListeners: ((connected: boolean) => void)[] = [];
const mockSavePlaybackPosition = jest.fn();
const mockFlushPlayQueue = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppRegistry: {
    registerHeadlessTask: (...args: unknown[]) =>
      mockRegisterHeadlessTask(...args),
  },
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: {
    language: "en",
    on: (_event: string, listener: () => void) => {
      mockLanguageListener = listener;
    },
    t: (key: string) => key,
  },
}));
jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: {
    available: false,
    notifyReady: () => mockNotifyReady(),
    invalidateChildren: jest.fn(),
    clearChildren: jest.fn(),
    onChildrenRequest: jest.fn(),
    onSearchRequest: jest.fn(),
    delay: jest.fn(async () => {}),
  },
}));
jest.mock("@/services/carAuto/connection", () => ({
  isCarConnected: () => true,
  subscribeCarConnection: (listener: (connected: boolean) => void) => {
    mockCarListeners.push(listener);
    return () => {};
  },
}));
jest.mock("@/services/carAuto/carplay", () => ({
  setupCarPlay: () => mockOrder.push("setupCarPlay"),
  refreshCarPlay: () => mockRefreshCarPlay(),
}));
jest.mock("@/services/carAuto/labels", () => ({ startLabels: jest.fn() }));
jest.mock("@/services/carAuto/artwork", () => ({
  startArtworkHeaders: jest.fn(),
}));
jest.mock("@/services/carAuto/nowPlaying", () => ({
  pushAll: jest.fn(),
  pushError: jest.fn(),
  queueOffset: () => 0,
  startPlaybackMirror: () => mockStartPlaybackMirror(),
}));
jest.mock("@/services/carAuto/browse", () => ({
  getChildren: jest.fn(),
  cachedListing: jest.fn(),
  clearListings: () => mockClearListings(),
  invalidateListings: jest.fn(),
  putListing: jest.fn(),
}));
jest.mock("@/services/carAuto/play", () => ({ playMediaId: jest.fn() }));
jest.mock("@/services/carAuto/voice", () => ({ playFromSearch: jest.fn() }));
jest.mock("@/services/carAuto/actions", () => ({
  runItemAction: jest.fn(),
  radioFromCurrentTrack: jest.fn(),
}));
jest.mock("@/services/carAuto/providers/search", () => ({
  runSearch: jest.fn(),
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => true,
  subscribeEffectiveOnline: jest.fn(),
}));
jest.mock("@/services/player", () => ({
  configurePlayback: async () => {
    mockOrder.push("configurePlayback");
  },
  savePlaybackPosition: () => mockSavePlaybackPosition(),
}));
jest.mock("@/services/playQueueSync", () => ({
  flushPlayQueue: () => mockFlushPlayQueue(),
  initPlayQueueSync: jest.fn(async () => {}),
}));
jest.mock("@/services/startupHydration", () => ({
  applyStartupLocale: jest.fn(),
  hydratePlaybackStores: async () => {
    mockOrder.push("hydrate");
  },
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  registerLogoutHandler: jest.fn(),
  useAuthBase: { getState: () => ({}), subscribe: jest.fn() },
}));
jest.mock("@/stores/carAuto", () => ({
  useCarAutoBase: { subscribe: jest.fn() },
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { subscribe: jest.fn() },
}));
jest.mock("@/stores/audiobookshelf", () => ({
  useAudiobookshelfBase: { subscribe: jest.fn() },
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
  default: { getState: () => ({ queue: [] }) },
}));

const startSession = async () => {
  jest.isolateModules(() => {
    require("@/services/carAuto/session").startCarAutoSession();
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  mockCarListeners.length = 0;
  mockSavePlaybackPosition.mockClear();
  mockFlushPlayQueue.mockClear();
});

describe("CarPlay session", () => {
  it("hydrates and configures playback before building CarPlay's root", async () => {
    await startSession();

    expect(mockOrder).toEqual(["hydrate", "configurePlayback", "setupCarPlay"]);
    expect(mockRegisterHeadlessTask).not.toHaveBeenCalled();
    expect(mockStartPlaybackMirror).not.toHaveBeenCalled();
    expect(mockNotifyReady).toHaveBeenCalledTimes(1);
  });

  it("saves the position and pushes the queue when CarPlay disconnects", async () => {
    await startSession();

    for (const listener of mockCarListeners) listener(false);

    expect(mockSavePlaybackPosition).toHaveBeenCalledTimes(1);
    expect(mockFlushPlayQueue).toHaveBeenCalledTimes(1);
  });

  it("rebuilds CarPlay's root when the language changes", async () => {
    await startSession();

    mockLanguageListener?.();

    expect(mockClearListings).toHaveBeenCalled();
    expect(mockRefreshCarPlay).toHaveBeenCalledTimes(1);
  });
});
