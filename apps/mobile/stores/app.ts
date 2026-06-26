import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import i18n, { applyZodLocale, type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

// "raw" streams the source file untouched (bit-perfect); the others ask the
// server to transcode to that codec via the Subsonic `format=` param.
export type StreamFormat = "raw" | "flac" | "opus" | "mp3" | "aac";

// Genre tag rows shown on the internet radio stations home screen, used when
// the user hasn't customized them.
export const DEFAULT_INTERNET_RADIO_FEED_TAGS = ["jazz", "rock", "news"];

interface AppStore {
  locale: TSupportedLanguages | null;
  setLocale: (locale: TSupportedLanguages) => void;
  showDrawer: boolean;
  setShowDrawer: (showDrawer: boolean) => void;
  showAddTab: boolean;
  setShowAddTab: (showAddTab: boolean) => void;
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
  libraryFilter:
    | "artists"
    | "albums"
    | "playlists"
    | "podcasts"
    | "radioStations"
    | "folders"
    | null;
  setLibraryFilter: (
    libraryFilter:
      | "artists"
      | "albums"
      | "playlists"
      | "podcasts"
      | "radioStations"
      | "folders"
      | null,
  ) => void;
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
  replayGainMode: "off" | "track" | "album";
  setReplayGainMode: (mode: "off" | "track" | "album") => void;
  replayGainPreampDb: number;
  setReplayGainPreampDb: (db: number) => void;
  crossfadeSeconds: number;
  setCrossfadeSeconds: (seconds: number) => void;
  gaplessEnabled: boolean;
  setGaplessEnabled: (enabled: boolean) => void;
  endlessPlaybackEnabled: boolean;
  setEndlessPlaybackEnabled: (enabled: boolean) => void;
  // See services/playQueueSync.ts.
  queueSyncPriority: "server" | "local" | "off";
  setQueueSyncPriority: (priority: "server" | "local" | "off") => void;
  // null = derive the "by country" feed from the device locale's region.
  internetRadioCountryCode: string | null;
  setInternetRadioCountryCode: (countryCode: string | null) => void;
  internetRadioFeedTags: string[];
  setInternetRadioFeedTags: (tags: string[]) => void;
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
      libraryFilter: null,
      setLibraryFilter: (
        libraryFilter:
          | "artists"
          | "albums"
          | "playlists"
          | "podcasts"
          | "radioStations"
          | "folders"
          | null,
      ) => {
        set({ libraryFilter });
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
      replayGainMode: "off",
      setReplayGainMode: (replayGainMode: "off" | "track" | "album") => {
        set({ replayGainMode });
      },
      replayGainPreampDb: 0,
      setReplayGainPreampDb: (replayGainPreampDb: number) => {
        set({ replayGainPreampDb });
      },
      crossfadeSeconds: 0,
      setCrossfadeSeconds: (crossfadeSeconds: number) => {
        set({ crossfadeSeconds: Math.max(0, Math.min(12, crossfadeSeconds)) });
      },
      gaplessEnabled: true,
      setGaplessEnabled: (gaplessEnabled: boolean) => {
        set({ gaplessEnabled });
      },
      endlessPlaybackEnabled: false,
      setEndlessPlaybackEnabled: (endlessPlaybackEnabled: boolean) => {
        set({ endlessPlaybackEnabled });
      },
      queueSyncPriority: "off",
      setQueueSyncPriority: (queueSyncPriority: "server" | "local" | "off") => {
        set({ queueSyncPriority });
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
    }),
    {
      name: "app",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) => !["showDrawer"].includes(key),
          ),
        ),
    },
  ),
);

const useApp = createSelectors(useAppBase);

export default useApp;
