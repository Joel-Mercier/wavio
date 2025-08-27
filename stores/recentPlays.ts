import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RecentPlay = {
  id: string;
  title: string;
  type: "album" | "artist" | "playlist" | "favorites";
  coverArt?: string;
};

interface RecentPlaysStore {
  recentPlays: RecentPlay[];
  addRecentPlay: (recentPlay: RecentPlay) => void;
}

const useRecentPlaysBase = create<RecentPlaysStore>()(
  persist(
    (set) => ({
      recentPlays: [],
      addRecentPlay: (recentPlay: RecentPlay) => {
        set((state) => {
          if (!state.recentPlays.some((play) => play.id === recentPlay.id)) {
            const newRecentPlays = [recentPlay, ...state.recentPlays];
            if (newRecentPlays.length > 8) {
              newRecentPlays.length = 8;
            }
            return { recentPlays: newRecentPlays };
          }
          return { recentPlays: state.recentPlays };
        });
      },
    }),
    {
      name: "recentPlays",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useRecentPlays = createSelectors(useRecentPlaysBase);

export default useRecentPlays;
