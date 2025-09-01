import i18n, { type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AppStore {
  locale: TSupportedLanguages | null;
  setLocale: (locale: TSupportedLanguages) => void;
  showDrawer: boolean;
  setShowDrawer: (showDrawer: boolean) => void;
}

export const useAppBase = create<AppStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale: TSupportedLanguages) => {
        i18n.changeLanguage(locale);
        set({ locale });
      },
      showDrawer: false,
      setShowDrawer: (showDrawer: boolean) => {
        set({ showDrawer });
      },
    }),
    {
      name: "app",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([key]) => !['showDrawer'].includes(key)),
        ),
    },
  ),
);

const useApp = createSelectors(useAppBase);

export default useApp;
