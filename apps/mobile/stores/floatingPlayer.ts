import { create } from "zustand";

// Whether the portrait floating player has been swiped away. Shared so the
// chrome stacked around it (the sleep-timer badge space) can follow it.
interface FloatingPlayerStore {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const useFloatingPlayer = create<FloatingPlayerStore>()((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

export default useFloatingPlayer;
