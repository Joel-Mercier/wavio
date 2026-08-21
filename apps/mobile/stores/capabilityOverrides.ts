import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { BackendCapabilities } from "@/services/backend/capabilities";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Runtime-detected capability downgrades, persisted per (server, user). The
// static matrix in services/backend/capabilities.ts is optimistic for features
// that are really a per-server config toggle (sharing, jukebox, podcasts) or an
// endpoint not every server implements (the song lists); when the server says it
// doesn't support one, the interceptor records the downgrade here so the UI
// hides the feature on the next render and across restarts (rather than
// re-offering a broken button every cold start).
//
// Each downgrade is stamped and expires after OVERRIDE_TTL_MS, so it heals: a
// one-off 501 from a reverse proxy — or an admin enabling the feature
// server-side — must not hide it forever. The first request after expiry
// re-latches it if the server still doesn't support it, and that failure is
// classified as expected noise, so a genuinely missing endpoint costs one
// request a week and never surfaces as an error.
export const OVERRIDE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CapabilityOverrides = Partial<
  Record<keyof BackendCapabilities, boolean>
>;

type CapabilityDisabledAt = Partial<Record<keyof BackendCapabilities, number>>;

interface CapabilityOverridesStore {
  disabledAt: CapabilityDisabledAt;
  disableCapability: (capability: keyof BackendCapabilities) => void;
  __reset: () => void;
}

const initialState = {
  disabledAt: {} as CapabilityDisabledAt,
};

// The overrides still in force, as a map to spread over the static matrix.
export function activeOverrides(
  disabledAt: CapabilityDisabledAt,
  now: number = Date.now(),
): CapabilityOverrides {
  const overrides: CapabilityOverrides = {};
  for (const [capability, at] of Object.entries(disabledAt)) {
    if (now - at < OVERRIDE_TTL_MS) {
      overrides[capability as keyof BackendCapabilities] = false;
    }
  }
  return overrides;
}

const useCapabilityOverridesBase = create<CapabilityOverridesStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      disableCapability: (capability) => {
        // Don't re-stamp one that's already in force: the write would churn the
        // store (and every capability consumer) on each failing request, and an
        // expired stamp is exactly what re-probing is meant to produce.
        const at = get().disabledAt[capability];
        if (at !== undefined && Date.now() - at < OVERRIDE_TTL_MS) return;
        set((state) => ({
          disabledAt: { ...state.disabledAt, [capability]: Date.now() },
        }));
      },
    }),
    {
      name: "capabilityOverridesStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      version: 1,
      // v0 stored `overrides: { [capability]: false }` with no stamp. Carry the
      // downgrades over stamped as of now, so they survive the upgrade and start
      // their TTL from here rather than all expiring at once.
      migrate: (persisted, version) => {
        if (version === 0) {
          const overrides =
            (persisted as { overrides?: CapabilityOverrides } | undefined)
              ?.overrides ?? {};
          const now = Date.now();
          const disabledAt: CapabilityDisabledAt = {};
          for (const [capability, disabled] of Object.entries(overrides)) {
            if (disabled === false) {
              disabledAt[capability as keyof BackendCapabilities] = now;
            }
          }
          return { disabledAt } as CapabilityOverridesStore;
        }
        return persisted as CapabilityOverridesStore;
      },
      partialize: (state) => ({ disabledAt: state.disabledAt }),
    },
  ),
);

const useCapabilityOverrides = createSelectors(useCapabilityOverridesBase);

export default useCapabilityOverrides;
export { useCapabilityOverridesBase };
