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

import { useAppBase } from "@/stores/app";

const reset = () =>
  useAppBase.setState(
    {
      locale: null,
      showDrawer: false,
      showAddTab: false,
      librarySort: "addedAtAsc",
      favoritesSort: "addedAtAsc",
      libraryFilter: null,
      maxBitRate: null,
      cellularMaxBitRate: null,
      downloadsWifiOnly: false,
      replayGainMode: "off",
      replayGainPreampDb: 0,
      crossfadeSeconds: 0,
      gaplessEnabled: true,
      endlessPlaybackEnabled: false,
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
    useAppBase.getState().setLibraryFilter("artists");
    expect(useAppBase.getState().libraryFilter).toBe("artists");
    useAppBase.getState().setLibraryFilter(null);
    expect(useAppBase.getState().libraryFilter).toBeNull();
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

  it("setCrossfadeSeconds clamps to [0, 12]", () => {
    useAppBase.getState().setCrossfadeSeconds(-5);
    expect(useAppBase.getState().crossfadeSeconds).toBe(0);
    useAppBase.getState().setCrossfadeSeconds(99);
    expect(useAppBase.getState().crossfadeSeconds).toBe(12);
    useAppBase.getState().setCrossfadeSeconds(7);
    expect(useAppBase.getState().crossfadeSeconds).toBe(7);
  });

  it("setGaplessEnabled toggles the flag", () => {
    useAppBase.getState().setGaplessEnabled(false);
    expect(useAppBase.getState().gaplessEnabled).toBe(false);
    useAppBase.getState().setGaplessEnabled(true);
    expect(useAppBase.getState().gaplessEnabled).toBe(true);
  });

  it("setEndlessPlaybackEnabled toggles the flag", () => {
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(false);
    useAppBase.getState().setEndlessPlaybackEnabled(true);
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(true);
    useAppBase.getState().setEndlessPlaybackEnabled(false);
    expect(useAppBase.getState().endlessPlaybackEnabled).toBe(false);
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
