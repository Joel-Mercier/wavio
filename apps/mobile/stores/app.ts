import { Orientation } from "expo-screen-orientation";
import { Dimensions } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import i18n, { applyZodLocale, type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

const isLandscapeOrientation = (orientation: Orientation) =>
  orientation === Orientation.LANDSCAPE_LEFT ||
  orientation === Orientation.LANDSCAPE_RIGHT;

// Width (dp) at or above which the app switches to its "wide" layout: left
// sidebar nav, docked player, two-column player, larger grids. Matches Android's
// sw600dp "tablet" breakpoint so a tablet/foldable in portrait — not just a phone
// in landscape — gets the wide layout. Phones stay below this in portrait.
export const WIDE_LAYOUT_BREAKPOINT = 600;

// The wide layout applies when the device is physically landscape OR the window
// is wide enough on its own (tablet, foldable, large-screen portrait).
const isWideLayout = (orientation: Orientation, windowWidth: number) =>
  isLandscapeOrientation(orientation) || windowWidth >= WIDE_LAYOUT_BREAKPOINT;

// "raw" streams the source file untouched (bit-perfect); the others ask the
// server to transcode to that codec via the Subsonic `format=` param.
export type StreamFormat = "raw" | "flac" | "opus" | "mp3" | "aac";

// Genre tag rows shown on the internet radio stations home screen, used when
// the user hasn't customized them.
export const DEFAULT_INTERNET_RADIO_FEED_TAGS = ["jazz", "rock", "news"];

export type LibraryFilter =
  | "artists"
  | "albums"
  | "playlists"
  | "podcasts"
  | "radioStations"
  | "folders";

// list = single-column rows, grid = responsive multi-column cards. Persisted
// per album-list screen (keyed in `albumScreenLayouts`) via
// `useAlbumScreenLayout`.
export type AlbumScreenLayout = "list" | "grid";

interface AppStore {
  locale: TSupportedLanguages | null;
  setLocale: (locale: TSupportedLanguages) => void;
  showDrawer: boolean;
  setShowDrawer: (showDrawer: boolean) => void;
  showAddTab: boolean;
  setShowAddTab: (showAddTab: boolean) => void;
  showEmptyHomeSections: boolean;
  setShowEmptyHomeSections: (showEmptyHomeSections: boolean) => void;
  // "off" hides lyrics entirely; "server" uses only server-embedded lyrics;
  // "all" also falls back to lrclib.net when the server has none.
  lyricsSource: "off" | "server" | "all";
  setLyricsSource: (lyricsSource: "off" | "server" | "all") => void;
  librarySort:
    | "addedAtAsc"
    | "addedAtDesc"
    | "alphabeticalAsc"
    | "alphabeticalDesc";
  setLibrarySort: (
    librarySort:
      | "addedAtAsc"
      | "addedAtDesc"
      | "alphabeticalAsc"
      | "alphabeticalDesc",
  ) => void;
  libraryFilter: LibraryFilter[];
  setLibraryFilter: (libraryFilter: LibraryFilter[]) => void;
  // Layout (list/grid) chosen on each album-list screen, keyed by a stable
  // screen id. One value per screen so choices don't bleed across screens.
  albumScreenLayouts: Record<string, AlbumScreenLayout>;
  setAlbumScreenLayout: (screenKey: string, layout: AlbumScreenLayout) => void;
  favoritesSort:
    | "addedAtAsc"
    | "addedAtDesc"
    | "alphabeticalAsc"
    | "alphabeticalDesc"
    | "artistAsc"
    | "artistDesc"
    | "albumAsc"
    | "albumDesc";
  setFavoritesSort: (
    favoritesSort:
      | "addedAtAsc"
      | "addedAtDesc"
      | "alphabeticalAsc"
      | "alphabeticalDesc"
      | "artistAsc"
      | "artistDesc"
      | "albumAsc"
      | "albumDesc",
  ) => void;
  maxBitRate: number | null;
  setMaxBitRate: (maxBitRate: number | null) => void;
  cellularMaxBitRate: number | null;
  setCellularMaxBitRate: (cellularMaxBitRate: number | null) => void;
  streamingFormat: StreamFormat;
  setStreamingFormat: (streamingFormat: StreamFormat) => void;
  downloadsWifiOnly: boolean;
  setDownloadsWifiOnly: (downloadsWifiOnly: boolean) => void;
  autoSignOutOnServerUnreachable: boolean;
  setAutoSignOutOnServerUnreachable: (enabled: boolean) => void;
  replayGainMode: "off" | "track" | "album";
  setReplayGainMode: (mode: "off" | "track" | "album") => void;
  replayGainPreampDb: number;
  setReplayGainPreampDb: (db: number) => void;
  endlessPlaybackEnabled: boolean;
  setEndlessPlaybackEnabled: (enabled: boolean) => void;
  // See services/playQueueSync.ts.
  queueSyncPriority: "server" | "local" | "off";
  setQueueSyncPriority: (priority: "server" | "local" | "off") => void;
  radioBrowserEnabled: boolean;
  setRadioBrowserEnabled: (enabled: boolean) => void;
  hapticFeedbackEnabled: boolean;
  setHapticFeedbackEnabled: (enabled: boolean) => void;
  // null = derive the "by country" feed from the device locale's region.
  internetRadioCountryCode: string | null;
  setInternetRadioCountryCode: (countryCode: string | null) => void;
  internetRadioFeedTags: string[];
  setInternetRadioFeedTags: (tags: string[]) => void;
  // Live device orientation + window width, kept in sync by
  // services/orientation.ts. Transient device state (not persisted) — exposed
  // here so any screen can branch its layout on `isWideLayout` without each one
  // subscribing to the dimension/orientation listeners.
  orientation: Orientation;
  windowWidth: number;
  isWideLayout: boolean;
  setOrientation: (orientation: Orientation) => void;
  setWindowWidth: (windowWidth: number) => void;
}

export const useAppBase = create<AppStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale: TSupportedLanguages) => {
        i18n.changeLanguage(locale);
        applyZodLocale(locale);
        set({ locale });
      },
      showDrawer: false,
      setShowDrawer: (showDrawer: boolean) => {
        set({ showDrawer });
      },
      showAddTab: false,
      setShowAddTab: (showAddTab: boolean) => {
        set({ showAddTab });
      },
      showEmptyHomeSections: true,
      setShowEmptyHomeSections: (showEmptyHomeSections: boolean) => {
        set({ showEmptyHomeSections });
      },
      lyricsSource: "all",
      setLyricsSource: (lyricsSource: "off" | "server" | "all") => {
        set({ lyricsSource });
      },
      librarySort: "addedAtAsc",
      setLibrarySort: (
        librarySort:
          | "addedAtAsc"
          | "addedAtDesc"
          | "alphabeticalAsc"
          | "alphabeticalDesc",
      ) => {
        set({ librarySort });
      },
      libraryFilter: [],
      setLibraryFilter: (libraryFilter: LibraryFilter[]) => {
        set({ libraryFilter });
      },
      albumScreenLayouts: {},
      setAlbumScreenLayout: (screenKey: string, layout: AlbumScreenLayout) => {
        set((state) => ({
          albumScreenLayouts: {
            ...state.albumScreenLayouts,
            [screenKey]: layout,
          },
        }));
      },
      favoritesSort: "addedAtAsc",
      setFavoritesSort: (
        favoritesSort:
          | "addedAtAsc"
          | "addedAtDesc"
          | "alphabeticalAsc"
          | "alphabeticalDesc"
          | "artistAsc"
          | "artistDesc"
          | "albumAsc"
          | "albumDesc",
      ) => {
        set({ favoritesSort });
      },
      maxBitRate: null,
      setMaxBitRate: (maxBitRate: number | null) => {
        set({ maxBitRate });
      },
      cellularMaxBitRate: null,
      setCellularMaxBitRate: (cellularMaxBitRate: number | null) => {
        set({ cellularMaxBitRate });
      },
      streamingFormat: "raw",
      setStreamingFormat: (streamingFormat: StreamFormat) => {
        set({ streamingFormat });
      },
      downloadsWifiOnly: false,
      setDownloadsWifiOnly: (downloadsWifiOnly: boolean) => {
        set({ downloadsWifiOnly });
      },
      autoSignOutOnServerUnreachable: true,
      setAutoSignOutOnServerUnreachable: (enabled: boolean) => {
        set({ autoSignOutOnServerUnreachable: enabled });
      },
      replayGainMode: "off",
      setReplayGainMode: (replayGainMode: "off" | "track" | "album") => {
        set({ replayGainMode });
      },
      replayGainPreampDb: 0,
      setReplayGainPreampDb: (replayGainPreampDb: number) => {
        set({ replayGainPreampDb });
      },
      endlessPlaybackEnabled: false,
      setEndlessPlaybackEnabled: (endlessPlaybackEnabled: boolean) => {
        set({ endlessPlaybackEnabled });
      },
      queueSyncPriority: "off",
      setQueueSyncPriority: (queueSyncPriority: "server" | "local" | "off") => {
        set({ queueSyncPriority });
      },
      radioBrowserEnabled: true,
      setRadioBrowserEnabled: (enabled: boolean) => {
        set({ radioBrowserEnabled: enabled });
      },
      hapticFeedbackEnabled: true,
      setHapticFeedbackEnabled: (enabled: boolean) => {
        set({ hapticFeedbackEnabled: enabled });
      },
      internetRadioCountryCode: null,
      setInternetRadioCountryCode: (
        internetRadioCountryCode: string | null,
      ) => {
        set({ internetRadioCountryCode });
      },
      internetRadioFeedTags: DEFAULT_INTERNET_RADIO_FEED_TAGS,
      setInternetRadioFeedTags: (internetRadioFeedTags: string[]) => {
        set({ internetRadioFeedTags });
      },
      orientation: Orientation.PORTRAIT_UP,
      windowWidth: Dimensions.get("window").width,
      isWideLayout: isWideLayout(
        Orientation.PORTRAIT_UP,
        Dimensions.get("window").width,
      ),
      setOrientation: (orientation: Orientation) => {
        set((state) => ({
          orientation,
          isWideLayout: isWideLayout(orientation, state.windowWidth),
        }));
      },
      setWindowWidth: (windowWidth: number) => {
        set((state) => ({
          windowWidth,
          isWideLayout: isWideLayout(state.orientation, windowWidth),
        }));
      },
    }),
    {
      name: "app",
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      // v0 persisted libraryFilter as a single string (or null); it is now a
      // multi-select array. Wrap an existing selection into a one-element array.
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppStore> & {
          libraryFilter?: LibraryFilter | LibraryFilter[] | null;
        };
        if (version < 1) {
          state.libraryFilter =
            typeof state.libraryFilter === "string"
              ? [state.libraryFilter]
              : [];
        }
        return state as AppStore;
      },
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) =>
              ![
                "showDrawer",
                "orientation",
                "windowWidth",
                "isWideLayout",
              ].includes(key),
          ),
        ),
    },
  ),
);

const useApp = createSelectors(useAppBase);

export default useApp;
