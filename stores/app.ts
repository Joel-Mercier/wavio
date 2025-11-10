import i18n, { type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
