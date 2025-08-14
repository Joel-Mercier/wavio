import { storage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";

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
  setRecentSearches: (recentSearches: RecentSearch[]) => void;
  addRecentSearch: (search: RecentSearch) => void;
}

const useRecentSearchesBase = create<RecentSearchesStore>()((set) => ({
  recentSearches: [],
  setRecentSearches: (recentSearches: RecentSearch[]) => {
    set(() => {
      storage.set("recentSearches", JSON.stringify(recentSearches));
      return { recentSearches };
    });
  },
  addRecentSearch: (search: RecentSearch) => {
    set((state) => {
      if (!state.recentSearches.includes(search)) {
        const newRecentSearches = [search, ...state.recentSearches];
        if (newRecentSearches.length > 24) {
          newRecentSearches.length = 24;
        }
        storage.set("recentSearches", JSON.stringify(newRecentSearches));
        return { recentSearches: newRecentSearches };
      }
      return { recentSearches: state.recentSearches };
    });
  },
}));

const useRecentSearches = createSelectors(useRecentSearchesBase);

export default useRecentSearches;
