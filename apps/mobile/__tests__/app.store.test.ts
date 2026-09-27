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

const mockChangeLanguage = jest.fn();
const mockApplyZodLocale = jest.fn();
const mockZodConfig = jest.fn();
const frLocale = { fr: true };
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: {
    changeLanguage: (lng: string) => mockChangeLanguage(lng),
  },
  applyZodLocale: (lng: "en" | "fr") => {
    mockApplyZodLocale(lng);
    if (lng === "fr") mockZodConfig(frLocale);
    else mockZodConfig({});
  },
}));

import { Orientation } from "expo-screen-orientation";
import { Dimensions } from "react-native";
import { PODCAST_PLAYBACK_RATES, useAppBase } from "@/stores/app";

const reset = () =>
  useAppBase.setState(
    {
      locale: null,
      showDrawer: false,
      showAddTab: false,
      librarySort: "addedAtAsc",
      favoritesSort: "addedAtAsc",
      libraryFilter: [],
      maxBitRate: null,
      cellularMaxBitRate: null,
      downloadsWifiOnly: false,
      replayGainMode: "off",
      replayGainPreampDb: 0,
      podcastPlaybackRate: 1,
      endlessPlaybackEnabled: false,
      queueSyncPriority: "off",
      orientation: Orientation.PORTRAIT_UP,
      windowWidth: 579,
      isWideLayout: false,
    },
    false,
  );

beforeEach(() => {
  reset();
  mockChangeLanguage.mockClear();
  mockApplyZodLocale.mockClear();
  mockZodConfig.mockClear();
});

describe("app store", () => {
  it("initializes layout from the current window width", () => {
    const initial = useAppBase.getInitialState();
    expect(initial.windowWidth).toBe(Dimensions.get("window").width);
    expect(initial.isWideLayout).toBe(initial.windowWidth >= 600);
  });

  describe.each([
    Orientation.PORTRAIT_UP,
    Orientation.PORTRAIT_DOWN,
    Orientation.LANDSCAPE_LEFT,
    Orientation.LANDSCAPE_RIGHT,
    Orientation.UNKNOWN,
  ])("window layout with orientation %s", (orientation) => {
    it.each([
      [579, false],
      [599, false],
      [600, true],
      [840, true],
    ])("uses width %s to select wide layout %s", (width, wide) => {
      useAppBase.getState().setOrientation(orientation);
      useAppBase.getState().setWindowWidth(width);
      expect(useAppBase.getState().isWideLayout).toBe(wide);
      useAppBase.getState().setOrientation(Orientation.PORTRAIT_UP);
      useAppBase.getState().setOrientation(orientation);
      expect(useAppBase.getState().orientation).toBe(orientation);
      expect(useAppBase.getState().windowWidth).toBe(width);
      expect(useAppBase.getState().isWideLayout).toBe(wide);
    });
  });

  it("returns to compact layout when a landscape window narrows", () => {
    useAppBase.getState().setOrientation(Orientation.LANDSCAPE_LEFT);
    useAppBase.getState().setWindowWidth(840);
    expect(useAppBase.getState().isWideLayout).toBe(true);
    useAppBase.getState().setWindowWidth(579);
    expect(useAppBase.getState().isWideLayout).toBe(false);
    useAppBase.getState().setOrientation(Orientation.LANDSCAPE_RIGHT);
    expect(useAppBase.getState().isWideLayout).toBe(false);
    useAppBase.getState().setWindowWidth(600);
    expect(useAppBase.getState().isWideLayout).toBe(true);
  });

  it("does not persist live window layout or device orientation", async () => {
    useAppBase.getState().setWindowWidth(840);
    useAppBase.getState().setOrientation(Orientation.LANDSCAPE_RIGHT);
    const storage = jest.requireMock("@/config/storage").zustandStorage;
    const persisted = JSON.parse(storage.getItem("app"));
    expect(persisted.state).not.toHaveProperty("windowWidth");
    expect(persisted.state).not.toHaveProperty("isWideLayout");
    expect(persisted.state).not.toHaveProperty("orientation");
    useAppBase.getState().setWindowWidth(579);
    await useAppBase.persist.rehydrate();
    expect(useAppBase.getState().isWideLayout).toBe(false);
    expect(useAppBase.getState().windowWidth).toBe(579);
  });

  it("setLocale updates locale and notifies i18n", () => {
    useAppBase.getState().setLocale("fr");
    expect(useAppBase.getState().locale).toBe("fr");
    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
  });

  it("setLocale switches the active zod locale", () => {
    useAppBase.getState().setLocale("fr");
    expect(mockZodConfig).toHaveBeenCalledWith(frLocale);
  });

  it("setShowDrawer toggles flag", () => {
    useAppBase.getState().setShowDrawer(true);
    expect(useAppBase.getState().showDrawer).toBe(true);
    useAppBase.getState().setShowDrawer(false);
    expect(useAppBase.getState().showDrawer).toBe(false);
  });

  it("setShowAddTab toggles flag", () => {
    useAppBase.getState().setShowAddTab(true);
    expect(useAppBase.getState().showAddTab).toBe(true);
  });

  it("setLibrarySort and setFavoritesSort update independently", () => {
    useAppBase.getState().setLibrarySort("alphabeticalDesc");
    useAppBase.getState().setFavoritesSort("addedAtDesc");
    expect(useAppBase.getState().librarySort).toBe("alphabeticalDesc");
    expect(useAppBase.getState().favoritesSort).toBe("addedAtDesc");
  });

  it("default sort values are addedAtAsc", () => {
    expect(useAppBase.getState().librarySort).toBe("addedAtAsc");
    expect(useAppBase.getState().favoritesSort).toBe("addedAtAsc");
  });

  it("setLibraryFilter sets and clears the filter", () => {
    useAppBase.getState().setLibraryFilter(["artists", "albums"]);
    expect(useAppBase.getState().libraryFilter).toEqual(["artists", "albums"]);
    useAppBase.getState().setLibraryFilter([]);
    expect(useAppBase.getState().libraryFilter).toEqual([]);
  });

  it("podcastPlaybackRate defaults to 1", () => {
    expect(useAppBase.getState().podcastPlaybackRate).toBe(1);
  });

  it("setPodcastPlaybackRate accepts every offered preset", () => {
    for (const rate of PODCAST_PLAYBACK_RATES) {
      useAppBase.getState().setPodcastPlaybackRate(rate);
      expect(useAppBase.getState().podcastPlaybackRate).toBe(rate);
    }
  });

  // The engine coerces an out-of-range rate natively, which would leave the UI
  // showing a speed that isn't the one playing.
  it("setPodcastPlaybackRate clamps to the engine's supported range", () => {
    useAppBase.getState().setPodcastPlaybackRate(4);
    expect(useAppBase.getState().podcastPlaybackRate).toBe(2);
    useAppBase.getState().setPodcastPlaybackRate(0.1);
    expect(useAppBase.getState().podcastPlaybackRate).toBe(0.5);
  });

  it("setPodcastPlaybackRate falls back to 1 for a non-finite rate", () => {
    useAppBase.getState().setPodcastPlaybackRate(Number.NaN);
    expect(useAppBase.getState().podcastPlaybackRate).toBe(1);
  });

  it("setMaxBitRate accepts numbers and null", () => {
    useAppBase.getState().setMaxBitRate(192);
    expect(useAppBase.getState().maxBitRate).toBe(192);
    useAppBase.getState().setMaxBitRate(null);
    expect(useAppBase.getState().maxBitRate).toBeNull();
  });

  it("setCellularMaxBitRate accepts numbers and null", () => {
    expect(useAppBase.getState().cellularMaxBitRate).toBeNull();
    useAppBase.getState().setCellularMaxBitRate(96);
    expect(useAppBase.getState().cellularMaxBitRate).toBe(96);
    useAppBase.getState().setCellularMaxBitRate(null);
    expect(useAppBase.getState().cellularMaxBitRate).toBeNull();
  });

  it("cellularStreamingFormat defaults to following the Wi-Fi format", () => {
    expect(useAppBase.getState().cellularStreamingFormat).toBe("same");
    useAppBase.getState().setCellularStreamingFormat("opus");
    expect(useAppBase.getState().cellularStreamingFormat).toBe("opus");
    useAppBase.getState().setCellularStreamingFormat("same");
    expect(useAppBase.getState().cellularStreamingFormat).toBe("same");
  });

  it("setDownloadsWifiOnly toggles the flag", () => {
    expect(useAppBase.getState().downloadsWifiOnly).toBe(false);
    useAppBase.getState().setDownloadsWifiOnly(true);
    expect(useAppBase.getState().downloadsWifiOnly).toBe(true);
    useAppBase.getState().setDownloadsWifiOnly(false);
    expect(useAppBase.getState().downloadsWifiOnly).toBe(false);
  });

  it("setReplayGainMode and setReplayGainPreampDb update independently", () => {
    useAppBase.getState().setReplayGainMode("track");
    useAppBase.getState().setReplayGainPreampDb(-3);
    expect(useAppBase.getState().replayGainMode).toBe("track");
    expect(useAppBase.getState().replayGainPreampDb).toBe(-3);
  });

  it("setEndlessPlaybackEnabled toggles the flag", () => {
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(false);
    useAppBase.getState().setEndlessPlaybackEnabled(true);
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(true);
    useAppBase.getState().setEndlessPlaybackEnabled(false);
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(false);
  });

  it("defaults queueSyncPriority to off", () => {
    expect(useAppBase.getState().queueSyncPriority).toBe("off");
  });

  it("setQueueSyncPriority cycles through server, local and off", () => {
    useAppBase.getState().setQueueSyncPriority("server");
    expect(useAppBase.getState().queueSyncPriority).toBe("server");
    useAppBase.getState().setQueueSyncPriority("local");
    expect(useAppBase.getState().queueSyncPriority).toBe("local");
    useAppBase.getState().setQueueSyncPriority("off");
    expect(useAppBase.getState().queueSyncPriority).toBe("off");
  });

  it("persists queueSyncPriority", () => {
    useAppBase.getState().setQueueSyncPriority("server");
    const storage = (
      jest.requireMock("@/config/storage") as {
        zustandStorage: { getItem: (k: string) => string | null };
      }
    ).zustandStorage;
    const persisted = JSON.parse(storage.getItem("app") as string);
    expect(persisted.state.queueSyncPriority).toBe("server");
  });

  it("migrates v1 persisted state to auto sign-out off", async () => {
    const storage = (
      jest.requireMock("@/config/storage") as {
        zustandStorage: {
          setItem: (k: string, v: string) => void;
          getItem: (k: string) => string | null;
        };
      }
    ).zustandStorage;
    storage.setItem(
      "app",
      JSON.stringify({
        state: { autoSignOutOnServerUnreachable: true, libraryFilter: [] },
        version: 1,
      }),
    );
    await useAppBase.persist.rehydrate();
    expect(useAppBase.getState().autoSignOutOnServerUnreachable).toBe(false);
    const persisted = JSON.parse(storage.getItem("app") as string);
    expect(persisted.version).toBe(2);
    expect(persisted.state.autoSignOutOnServerUnreachable).toBe(false);
  });

  it("partialize excludes showDrawer from persisted state", async () => {
    useAppBase.getState().setShowDrawer(true);
    useAppBase.getState().setShowAddTab(true);
    const storage = (
      jest.requireMock("@/config/storage") as {
        zustandStorage: { getItem: (k: string) => string | null };
      }
    ).zustandStorage;
    const raw = storage.getItem("app");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted.state).not.toHaveProperty("showDrawer");
    expect(persisted.state.showAddTab).toBe(true);
  });
});
