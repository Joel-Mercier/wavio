import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { JukeboxStatus } from "@/services/openSubsonic/types";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

type State = {
  active: boolean;
  status: JukeboxStatus | null;
  gain: number;
  // True when a jukebox session was found still playing on the server at app
  // launch and we're prompting the user to resume control. Never persisted.
  pendingResume: boolean;
};

type Actions = {
  setActive: (active: boolean) => void;
  setStatus: (status: JukeboxStatus | null) => void;
  setGain: (gain: number) => void;
  setPendingResume: (pendingResume: boolean) => void;
};

const initialState: State = {
  active: false,
  status: null,
  gain: 0.5,
  pendingResume: false,
};

const useJukeboxBase = create<State & Actions>()(
  persist(
    (set) => ({
      ...initialState,
      setActive: (active) => set({ active }),
      setStatus: (status) => set({ status }),
      setGain: (gain) => set({ gain }),
      setPendingResume: (pendingResume) => set({ pendingResume }),
    }),
    {
      name: "jukeboxStore",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      partialize: (state) => ({ active: state.active, gain: state.gain }),
    },
  ),
);

const useJukebox = createSelectors(useJukeboxBase);

export default useJukebox;
