import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import i18n, { type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

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
  favoritesSort:
    | "addedAtAsc"
    | "addedAtDesc"
    | "alphabeticalAsc"
    | "alphabeticalDesc";
  setFavoritesSort: (
    favoritesSort:
      | "addedAtAsc"
      | "addedAtDesc"
      | "alphabeticalAsc"
      | "alphabeticalDesc",
  ) => void;
  maxBitRate: number | null;
  setMaxBitRate: (maxBitRate: number | null) => void;
  replayGainMode: "off" | "track" | "album";
  setReplayGainMode: (mode: "off" | "track" | "album") => void;
  replayGainPreampDb: number;
  setReplayGainPreampDb: (db: number) => void;
  crossfadeSeconds: number;
  setCrossfadeSeconds: (seconds: number) => void;
  gaplessEnabled: boolean;
  setGaplessEnabled: (enabled: boolean) => void;
}

export const useAppBase = create<AppStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale: TSupportedLanguages) => {
        i18n.changeLanguage(locale);
        z.config(z.locales[locale]());
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
      favoritesSort: "addedAtAsc",
      setFavoritesSort: (
        favoritesSort:
          | "addedAtAsc"
          | "addedAtDesc"
          | "alphabeticalAsc"
          | "alphabeticalDesc",
      ) => {
        set({ favoritesSort });
      },
      maxBitRate: null,
      setMaxBitRate: (maxBitRate: number | null) => {
        set({ maxBitRate });
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
