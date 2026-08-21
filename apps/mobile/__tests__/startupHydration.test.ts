// A headless boot (Android Auto binding the media service with the app closed)
// never mounts app/, so this module is the only thing standing between the car
// and a session running on empty defaults. The order it does its work in is the
// whole point: the storage-scope migration has to rename the legacy buckets
// before any scoped store reads (and then persists over) them.
const mockOrder: string[] = [];

jest.mock("@/services/storageScopeMigration", () => ({
  runStorageScopeMigration: jest.fn(() => {
    mockOrder.push("migration");
  }),
}));

const mockRehydrate = (name: string) =>
  jest.fn(() => {
    mockOrder.push(name);
    return Promise.resolve();
  });

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { persist: { rehydrate: mockRehydrate("queue") } },
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { persist: { rehydrate: mockRehydrate("recentPlays") } },
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { persist: { rehydrate: mockRehydrate("offline") } },
}));
jest.mock("@/stores/listenBrainz", () => ({
  __esModule: true,
  default: { persist: { rehydrate: mockRehydrate("listenBrainz") } },
}));

const mockInitScrobbler = jest.fn(() => {
  mockOrder.push("scrobblerInit");
});
jest.mock("@/services/listenBrainz/scrobbler", () => ({
  initListenBrainzScrobbler: mockInitScrobbler,
}));

let mockIsAuthenticated = true;
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ isAuthenticated: mockIsAuthenticated }) },
}));

let mockLocale: string | null = null;
const mockSetLocale = jest.fn((next: string) => {
  mockLocale = next;
});
jest.mock("@/stores/app", () => ({
  __esModule: true,
  default: {
    getState: () => ({ locale: mockLocale, setLocale: mockSetLocale }),
  },
}));

const mockChangeLanguage = jest.fn();
const mockApplyZodLocale = jest.fn();
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: mockChangeLanguage },
  applyZodLocale: mockApplyZodLocale,
  SupportedLanguages: ["en", "fr", "de", "it", "es", "zh-CN", "ru"],
}));

let mockLocales: { languageCode: string | null }[] = [];
jest.mock("expo-localization", () => ({
  getLocales: () => mockLocales,
}));

type StartupHydration = typeof import("@/services/startupHydration");

const load = (): StartupHydration => {
  jest.resetModules();
  return require("@/services/startupHydration") as StartupHydration;
};

beforeEach(() => {
  mockOrder.length = 0;
  mockIsAuthenticated = true;
  mockLocale = null;
  mockLocales = [];
  jest.clearAllMocks();
});

describe("hydratePlaybackStores", () => {
  test("renames the legacy storage buckets before any scoped store reads them", async () => {
    await load().hydratePlaybackStores();
    expect(mockOrder[0]).toBe("migration");
    expect(mockOrder.slice(1).sort()).toEqual([
      "listenBrainz",
      "offline",
      "queue",
      "recentPlays",
      "scrobblerInit",
    ]);
  });

  test("starts the ListenBrainz drain loop only after its store has hydrated", async () => {
    // Playback in the car scrobbles like anywhere else, and nothing under app/
    // mounts here to do this wiring. Starting the loop before hydration would
    // drain an empty queue and miss whatever the last session left behind.
    await load().hydratePlaybackStores();
    expect(mockOrder.indexOf("scrobblerInit")).toBeGreaterThan(
      mockOrder.indexOf("listenBrainz"),
    );
  });

  test("hydrates each store once however many times it is called", async () => {
    const { hydratePlaybackStores } = load();
    await Promise.all([
      hydratePlaybackStores(),
      hydratePlaybackStores(),
      hydratePlaybackStores(),
    ]);
    expect(mockOrder.filter((c) => c === "queue")).toHaveLength(1);
  });

  test("skips hydration when signed out, and still hydrates on a later call", async () => {
    mockIsAuthenticated = false;
    const { hydratePlaybackStores } = load();
    await hydratePlaybackStores();
    expect(mockOrder).toEqual(["migration"]);

    mockIsAuthenticated = true;
    await hydratePlaybackStores();
    expect(mockOrder).toContain("queue");
  });
});

describe("applyStartupLocale", () => {
  test("applies the saved locale", () => {
    load().applyStartupLocale("fr");
    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    expect(mockApplyZodLocale).toHaveBeenCalledWith("fr");
    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  test("reads the saved locale from the store when not given one", () => {
    mockLocale = "de";
    load().applyStartupLocale();
    expect(mockChangeLanguage).toHaveBeenCalledWith("de");
  });

  test("falls back to a supported device locale", () => {
    mockLocales = [{ languageCode: "it" }];
    load().applyStartupLocale(null);
    expect(mockSetLocale).toHaveBeenCalledWith("it");
  });

  test("maps any Chinese base code onto the region-qualified zh-CN", () => {
    mockLocales = [{ languageCode: "zh" }];
    load().applyStartupLocale(null);
    expect(mockSetLocale).toHaveBeenCalledWith("zh-CN");
  });

  test("falls back to English for an unsupported device locale", () => {
    mockLocales = [{ languageCode: "pt" }];
    load().applyStartupLocale(null);
    expect(mockSetLocale).toHaveBeenCalledWith("en");
  });
});
