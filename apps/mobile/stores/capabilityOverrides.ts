import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import type { BackendCapabilities } from "@/services/backend/capabilities";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Runtime-detected capability downgrades, persisted per (server, user). The
// static matrix in services/backend/capabilities.ts is optimistic for features
// that are really a per-server config toggle (sharing, jukebox, podcasts); when
// the server answers 501 for one of their endpoints the interceptor records the
// downgrade here so the UI hides the feature on the next render and across
// restarts (rather than re-offering a broken button every cold start). Only ever
// flipped to `false` — a missing key means "use the static default".
export type CapabilityOverrides = Partial<
  Record<keyof BackendCapabilities, boolean>
>;

interface CapabilityOverridesStore {
  overrides: CapabilityOverrides;
  disableCapability: (capability: keyof BackendCapabilities) => void;
  __reset: () => void;
}

const initialState = {
  overrides: {} as CapabilityOverrides,
};

const useCapabilityOverridesBase = create<CapabilityOverridesStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      disableCapability: (capability) => {
        if (get().overrides[capability] === false) return;
        set((state) => ({
          overrides: { ...state.overrides, [capability]: false },
        }));
      },
    }),
    {
      name: "capabilityOverridesStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);

const useCapabilityOverrides = createSelectors(useCapabilityOverridesBase);

export default useCapabilityOverrides;
export { useCapabilityOverridesBase };
