import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RecentSearch = {
  id: string;
  title: string;
  type: "album" | "artist" | "playlist" | "song" | "query";
  coverArt?: string;
  albumId?: string;
  artist?: string;
};

interface RecentSearchesStore {
  recentSearches: RecentSearch[];
  addRecentSearch: (search: RecentSearch) => void;
  clearRecentSearches: () => void;
  removeRecentSearch: (id: string) => void;
}

const useRecentSearchesBase = create<RecentSearchesStore>()(
  persist(
    (set) => ({
      recentSearches: [],
      addRecentSearch: (search: RecentSearch) => {
        set((state) => {
          if (!state.recentSearches.includes(search)) {
            const newRecentSearches = [search, ...state.recentSearches];
            if (newRecentSearches.length > 24) {
              newRecentSearches.length = 24;
            }
            return { recentSearches: newRecentSearches };
          }
          return { recentSearches: state.recentSearches };
        });
      },
      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },
      removeRecentSearch: (id: string) => {
        set((state) => {
          return {
            recentSearches: state.recentSearches.filter(
              (search) => search.id !== id,
            ),
          };
        });
      },
    }),
    {
      name: "recentSearches",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useRecentSearches = createSelectors(useRecentSearchesBase);

export default useRecentSearches;
