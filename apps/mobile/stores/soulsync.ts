import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// SoulSync downloader connection, persisted per (server, user): a SoulSync
// instance imports into the music server whose library it manages, so switching
// servers must not carry the previous server's config. The API key is a
// credential, another reason to keep it scoped.
interface SoulSyncStore {
  serverUrl: string;
  apiKey: string;
  // Set true after /system/status succeeds; gates the search/downloads UI.
  isConnected: boolean;
  // SoulSync supports multiple user profiles; every call carries this as the
  // X-Profile-Id header. 1 is its default profile.
  profileId: number;
  setConfig: (config: { serverUrl: string; apiKey: string }) => void;
  setConnected: (connected: boolean) => void;
  setProfileId: (profileId: number) => void;
  clearConfig: () => void;
  __reset: () => void;
}

const initialState = {
  serverUrl: "",
  apiKey: "",
  isConnected: false,
  profileId: 1,
};

const useSoulSyncBase = create<SoulSyncStore>()(
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
      setProfileId: (profileId) => {
        set({ profileId });
      },
      clearConfig: () => {
        set({ serverUrl: "", apiKey: "", isConnected: false });
      },
    }),
    {
      name: "soulsyncStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        apiKey: state.apiKey,
        isConnected: state.isConnected,
        profileId: state.profileId,
      }),
    },
  ),
);

const useSoulSync = createSelectors(useSoulSyncBase);

export default useSoulSync;
export { useSoulSyncBase };
