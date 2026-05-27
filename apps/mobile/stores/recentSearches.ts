import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

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
  __reset: () => void;
}

const useRecentSearchesBase = create<RecentSearchesStore>()(
  persist(
    (set) => ({
      recentSearches: [],
      addRecentSearch: (search: RecentSearch) => {
        set((state) => {
          const newRecentSearches = [
            search,
            ...state.recentSearches.filter(
              (existing) =>
                existing.id !== search.id || existing.type !== search.type,
            ),
          ];
          if (newRecentSearches.length > 24) {
            newRecentSearches.length = 24;
          }
          return { recentSearches: newRecentSearches };
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
      __reset: () => {
        set({ recentSearches: [] });
      },
    }),
    {
      name: "recentSearches",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
    },
  ),
);

const useRecentSearches = createSelectors(useRecentSearchesBase);

export default useRecentSearches;
