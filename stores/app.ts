import i18n, { type TSupportedLanguages } from "@/config/i18n";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
interface AppStore {
  locale: TSupportedLanguages | null;
  setLocale: (locale: TSupportedLanguages) => void;
}

export const useAppBase = create<AppStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale: TSupportedLanguages) => {
        i18n.changeLanguage(locale);
        set({ locale });
      },
    }),
    {
      name: "app",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useApp = createSelectors(useAppBase);

export default useApp;
