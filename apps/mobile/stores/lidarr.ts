import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Lidarr downloader connection, persisted per (server, user): a Lidarr instance
// is only meaningful for the music server whose scan folder matches Lidarr's
// root folder, so switching servers must not carry the previous server's
// config. The API key is a credential, another reason to keep it scoped.
interface LidarrStore {
  serverUrl: string;
  apiKey: string;
  // Set true after /system/status succeeds; gates the discovery/downloads UI.
  isConnected: boolean;
  // Trigger a server library rescan when a Lidarr download finishes, so the
  // fetched album surfaces in the app without a manual refresh.
  autoScanOnComplete: boolean;
  // Add-option defaults applied when adding an album, chosen in the discovery
  // filters sheet. null until the user (or the first-load defaults) sets them.
  qualityProfileId: number | null;
  metadataProfileId: number | null;
  rootFolderPath: string | null;
  monitorAdded: boolean;
  setConfig: (config: { serverUrl: string; apiKey: string }) => void;
  setConnected: (connected: boolean) => void;
  setAutoScanOnComplete: (value: boolean) => void;
  setAddDefaults: (defaults: {
    qualityProfileId?: number | null;
    metadataProfileId?: number | null;
    rootFolderPath?: string | null;
    monitorAdded?: boolean;
  }) => void;
  clearConfig: () => void;
  __reset: () => void;
}

const initialState = {
  serverUrl: "",
  apiKey: "",
  isConnected: false,
  autoScanOnComplete: true,
  qualityProfileId: null,
  metadataProfileId: null,
  rootFolderPath: null,
  monitorAdded: true,
};

const useLidarrBase = create<LidarrStore>()(
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
      setAddDefaults: (defaults) => {
        set((state) => ({
          qualityProfileId:
            defaults.qualityProfileId !== undefined
              ? defaults.qualityProfileId
              : state.qualityProfileId,
          metadataProfileId:
            defaults.metadataProfileId !== undefined
              ? defaults.metadataProfileId
              : state.metadataProfileId,
          rootFolderPath:
            defaults.rootFolderPath !== undefined
              ? defaults.rootFolderPath
              : state.rootFolderPath,
          monitorAdded:
            defaults.monitorAdded !== undefined
              ? defaults.monitorAdded
              : state.monitorAdded,
        }));
      },
      clearConfig: () => {
        set({ serverUrl: "", apiKey: "", isConnected: false });
      },
    }),
    {
      name: "lidarrStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        apiKey: state.apiKey,
        isConnected: state.isConnected,
        autoScanOnComplete: state.autoScanOnComplete,
        qualityProfileId: state.qualityProfileId,
        metadataProfileId: state.metadataProfileId,
        rootFolderPath: state.rootFolderPath,
        monitorAdded: state.monitorAdded,
      }),
    },
  ),
);

const useLidarr = createSelectors(useLidarrBase);

export default useLidarr;
export { useLidarrBase };
