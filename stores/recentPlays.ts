import { storage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";

export type RecentPlay = {
  id: string;
  title: string;
  type: "album" | "artist" | "playlist" | "favorites";
  coverArt?: string;
};

interface RecentPlaysStore {
  recentPlays: RecentPlay[];
  setRecentPlays: (recentPlays: RecentPlay[]) => void;
  addRecentPlay: (recentPlay: RecentPlay) => void;
}

const useRecentPlaysBase = create<RecentPlaysStore>()((set) => ({
  recentPlays: [],
  setRecentPlays: (recentPlays: RecentPlay[]) => {
    set(() => {
      storage.set("recentPlays", JSON.stringify(recentPlays));
      return { recentPlays };
    });
  },
  addRecentPlay: (recentPlay: RecentPlay) => {
    set((state) => {
      if (!state.recentPlays.includes(recentPlay)) {
        const newRecentPlays = [recentPlay, ...state.recentPlays];
        if (newRecentPlays.length > 8) {
          newRecentPlays.length = 8;
        }
        storage.set("recentPlays", JSON.stringify(newRecentPlays));
        return { recentPlays: newRecentPlays };
      }
      return { recentPlays: state.recentPlays };
    });
  },
}));

const useRecentPlays = createSelectors(useRecentPlaysBase);

export default useRecentPlays;
