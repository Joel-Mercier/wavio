import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { TidarrQuality } from "@/services/tidarr/types";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Tidarr downloader connection, persisted per (server, user): a Tidarr instance
// downloads into the library of one music server, so switching servers must not
// carry the previous server's config. The API key is a credential, another
// reason to keep it scoped.
interface TidarrStore {
  serverUrl: string;
  // Optional: Tidarr only enforces auth when ADMIN_PASSWORD or OIDC is set, so
  // an instance on a trusted LAN often needs no key at all.
  apiKey: string;
  // Set true after /api/settings succeeds; gates the search/downloads UI.
  isConnected: boolean;
  // Trigger a server library rescan when a download finishes, so the fetched
  // album surfaces in the app without a manual refresh.
  autoScanOnComplete: boolean;
  // Read from the instance on connect. Every Tidal proxy call carries the
  // country code; without it the catalog answers for the wrong region.
  countryCode: string;
  // null = defer to whatever quality the instance is configured for.
  quality: TidarrQuality | null;
  setConfig: (config: { serverUrl: string; apiKey: string }) => void;
  setConnected: (connected: boolean) => void;
  setAutoScanOnComplete: (value: boolean) => void;
  setInstanceDefaults: (defaults: {
    countryCode?: string;
    quality?: TidarrQuality | null;
  }) => void;
  clearConfig: () => void;
  __reset: () => void;
}

const initialState = {
  serverUrl: "",
  apiKey: "",
  isConnected: false,
  autoScanOnComplete: true,
  countryCode: "US",
  quality: null,
};

const useTidarrBase = create<TidarrStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setConfig: ({ serverUrl, apiKey }) => {
        set({ serverUrl, apiKey });
      },
      setConnected: (isConnected) => {
        set({ isConnected });
      },
      setAutoScanOnComplete: (autoScanOnComplete) => {
        set({ autoScanOnComplete });
      },
      setInstanceDefaults: (defaults) => {
        set((state) => ({
          countryCode: defaults.countryCode ?? state.countryCode,
          quality:
            defaults.quality !== undefined ? defaults.quality : state.quality,
        }));
      },
      // Everything read from the instance goes too: the next Tidarr configured
      // here is a different instance, and inheriting the previous one's country
      // code would silently query the wrong Tidal catalog.
      clearConfig: () => {
        set({
          serverUrl: "",
          apiKey: "",
          isConnected: false,
          countryCode: initialState.countryCode,
          quality: initialState.quality,
        });
      },
    }),
    {
      name: "tidarrStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        apiKey: state.apiKey,
        isConnected: state.isConnected,
        autoScanOnComplete: state.autoScanOnComplete,
        countryCode: state.countryCode,
        quality: state.quality,
      }),
    },
  ),
);

const useTidarr = createSelectors(useTidarrBase);

export default useTidarr;
export { useTidarrBase };
