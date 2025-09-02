import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AuthStore = {}

export const useAuthBase = create<AuthStore>()(
  persist(
    (set) => ({

    }),
    {
      name: "auth",
      storage: createJSONStorage(() => zustandStorage),
      // partialize: (state) =>
      //   Object.fromEntries(
      //     Object.entries(state).filter(([key]) => !['showDrawer'].includes(key)),
      //   ),
    },
  ),
);

const useAuth = createSelectors(useAuthBase);

export default useAuth;
