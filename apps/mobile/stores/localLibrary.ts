import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import type { ScanPhase, ScanResult } from "@/services/local/indexer";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Scan state for the on-device local-library feature. The source folders are
// configured on the local *server* entry (stores/servers.ts → Server.paths),
// and the track index itself lives in SQLite (services/local/*); this store
// only tracks scanning:
//  - persisted (scoped per server+user like every other store): a small summary
//    of the last scan.
//  - ephemeral: live scan progress, reset on every app start.

export type ScanStatus = {
  phase: ScanPhase | "idle";
  processed: number;
  total: number;
  currentFile?: string;
  error?: string;
};

const idleStatus: ScanStatus = { phase: "idle", processed: 0, total: 0 };

interface LocalLibraryStore {
  // --- persisted ---
  lastScanAt: number | undefined;
  lastScanResult: ScanResult | undefined;

  // --- ephemeral ---
  status: ScanStatus;

  setStatus: (status: ScanStatus) => void;
  setScanFinished: (result: ScanResult) => void;
  __reset: () => void;
}

const initialState = {
  lastScanAt: undefined as number | undefined,
  lastScanResult: undefined as ScanResult | undefined,
  status: idleStatus,
};

const useLocalLibraryBase = create<LocalLibraryStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setStatus: (status) => {
        set({ status });
      },

      setScanFinished: (result) => {
        set({
          status: idleStatus,
          lastScanAt: Date.now(),
          lastScanResult: result,
        });
      },
    }),
    {
      name: "localLibraryStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
      // Never persist live scan progress.
      partialize: (state) => ({
        lastScanAt: state.lastScanAt,
        lastScanResult: state.lastScanResult,
      }),
    },
  ),
);

const useLocalLibrary = createSelectors(useLocalLibraryBase);

export default useLocalLibrary;
