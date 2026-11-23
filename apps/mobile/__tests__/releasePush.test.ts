jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

const mockI18nListeners = new Map<string, () => void>();
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: {
    changeLanguage: jest.fn(),
    t: (key: string, options?: { version?: string }) =>
      options?.version ? `${key}:${options.version}` : key,
    on: (event: string, listener: () => void) =>
      mockI18nListeners.set(event, listener),
    off: (event: string) => mockI18nListeners.delete(event),
  },
  applyZodLocale: jest.fn(),
}));

const mockDistribution = { isGithubDistribution: true };
jest.mock("@/config/distribution", () => ({
  get isGithubDistribution() {
    return mockDistribution.isGithubDistribution;
  },
  isStoreDistribution: false,
}));

jest.mock("@/services/appUpdate", () => ({
  latestReleaseApiUrl: "https://api.github.com/repos/o/r/releases/latest",
}));

jest.mock("@/services/notificationPermission", () => ({
  notificationPermissionIsRuntime: true,
  requestPostNotifications: jest.fn(async () => "granted"),
}));

const mockConfigure = jest.fn();
const mockNotificationsEnabled = jest.fn(() => false);
const mockConsumeTap = jest.fn<string | null, []>(() => null);
let mockTapListener: (() => void) | null = null;
jest.mock("@/modules/release-push", () => ({
  isReleasePushAvailable: () => true,
  configureReleasePush: (config: unknown) => mockConfigure(config),
  markReleaseSeen: jest.fn(),
  areNotificationsEnabled: () => mockNotificationsEnabled(),
  consumeTappedReleaseVersion: () => mockConsumeTap(),
  onReleaseNotificationTap: (listener: () => void) => {
    mockTapListener = listener;
    return () => {
      mockTapListener = null;
    };
  },
}));

type ReleasePushService = typeof import("@/services/releasePush");
type AppStore = typeof import("@/stores/app").useAppBase;

let useAppBase: AppStore;
let reactNative: typeof import("react-native");

// `releaseNotificationsSupported` is computed at import, so each test loads the
// service under the platform and distribution it describes. The store comes
// from the same module registry, or the service would read another instance.
function loadService(
  os: "android" | "ios" = "android",
  github = true,
): ReleasePushService {
  mockDistribution.isGithubDistribution = github;
  let service: ReleasePushService | undefined;
  jest.isolateModules(() => {
    reactNative = require("react-native");
    Object.defineProperty(reactNative.Platform, "OS", {
      get: () => os,
      configurable: true,
    });
    useAppBase = require("@/stores/app").useAppBase;
    useAppBase.setState({
      releaseNotificationsEnabled: storeSeed.enabled,
      releaseNotificationsPromptHandled: storeSeed.handled,
    });
    service = require("@/services/releasePush");
  });
  return service as ReleasePushService;
}

const storeSeed = { enabled: true, handled: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockI18nListeners.clear();
  mockTapListener = null;
  mockNotificationsEnabled.mockReturnValue(false);
  mockConsumeTap.mockReturnValue(null);
  storeSeed.enabled = true;
  storeSeed.handled = false;
});

describe("release notification settings", () => {
  it("are on by default, with the permission prompt still to come", () => {
    loadService();
    const initial = useAppBase.getInitialState();
    expect(initial.releaseNotificationsEnabled).toBe(true);
    expect(initial.releaseNotificationsPromptHandled).toBe(false);
  });
});

describe("initReleasePush", () => {
  it("pushes the setting, the localized copy and the release API address", () => {
    const stop = loadService().initReleasePush();
    expect(mockConfigure).toHaveBeenCalledWith({
      enabled: true,
      title: "app.update.notification.title:{version}",
      body: "app.update.notification.body",
      channelName: "app.update.notification.channelName",
      latestReleaseUrl: "https://api.github.com/repos/o/r/releases/latest",
    });
    stop();
  });

  it("re-pushes when the setting changes and when the language changes", () => {
    const stop = loadService().initReleasePush();
    mockConfigure.mockClear();

    useAppBase.getState().setReleaseNotificationsEnabled(false);
    expect(mockConfigure).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );

    mockI18nListeners.get("languageChanged")?.();
    expect(mockConfigure).toHaveBeenCalledTimes(2);

    useAppBase.getState().setReleaseNotificationsPromptHandled(true);
    expect(mockConfigure).toHaveBeenCalledTimes(2);
    stop();
    expect(mockI18nListeners.has("languageChanged")).toBe(false);
  });

  it("does nothing on a store build or off Android", () => {
    loadService("android", false).initReleasePush();
    loadService("ios", true).initReleasePush();
    expect(mockConfigure).not.toHaveBeenCalled();
  });
});

describe("takeReleaseNotificationsPrompt", () => {
  it("asks when the setting is on and notifications aren't allowed yet", () => {
    expect(loadService().takeReleaseNotificationsPrompt()).toBe(true);
    expect(useAppBase.getState().releaseNotificationsPromptHandled).toBe(false);
  });

  it("settles silently when notifications are already allowed", () => {
    mockNotificationsEnabled.mockReturnValue(true);
    expect(loadService().takeReleaseNotificationsPrompt()).toBe(false);
    expect(useAppBase.getState().releaseNotificationsPromptHandled).toBe(true);
  });

  it("settles silently when the user already turned the setting off", () => {
    storeSeed.enabled = false;
    expect(loadService().takeReleaseNotificationsPrompt()).toBe(false);
    expect(useAppBase.getState().releaseNotificationsPromptHandled).toBe(true);
  });

  it("never asks twice", () => {
    storeSeed.handled = true;
    expect(loadService().takeReleaseNotificationsPrompt()).toBe(false);
  });
});

describe("subscribeReleaseNotificationTaps", () => {
  it("answers a tap that launched the app", () => {
    mockConsumeTap.mockReturnValueOnce("1.6.0");
    const listener = jest.fn();
    loadService().subscribeReleaseNotificationTaps(listener);
    expect(listener).toHaveBeenCalledWith("1.6.0");
  });

  it("answers later taps, once each", () => {
    const listener = jest.fn();
    const stop = loadService().subscribeReleaseNotificationTaps(listener);
    expect(listener).not.toHaveBeenCalled();

    mockConsumeTap.mockReturnValueOnce("1.6.0");
    mockTapListener?.();
    mockTapListener?.();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("1.6.0");

    stop();
    expect(mockTapListener).toBeNull();
  });
});

describe("enableReleaseNotificationsFromSystemSettings", () => {
  function openFromSettings(allowedOnReturn: boolean) {
    storeSeed.enabled = false;
    const service = loadService();
    let onChange: ((state: string) => void) | undefined;
    const remove = jest.fn();
    jest
      .spyOn(reactNative.AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        onChange = listener as (state: string) => void;
        return { remove } as never;
      });
    const openSettings = jest
      .spyOn(reactNative.Linking, "openSettings")
      .mockResolvedValue(undefined);

    service.enableReleaseNotificationsFromSystemSettings();
    expect(openSettings).toHaveBeenCalled();
    onChange?.("background");
    mockNotificationsEnabled.mockReturnValue(allowedOnReturn);
    onChange?.("active");
    return remove;
  }

  it("turns the setting on when notifications were allowed there", () => {
    const remove = openFromSettings(true);
    expect(useAppBase.getState().releaseNotificationsEnabled).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("leaves it off when the user came back without allowing them", () => {
    const remove = openFromSettings(false);
    expect(useAppBase.getState().releaseNotificationsEnabled).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
