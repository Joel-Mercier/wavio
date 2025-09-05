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

// Default to Favorites to ensure it appears after hydration unless overridden
let ensuredRecentPlayOnHydration: RecentPlay | null = {
  id: "favorites",
  title: "Favorites",
  type: "favorites",
};

export const setEnsuredRecentPlayOnHydration = (
  recentPlay: RecentPlay | null,
) => {
  ensuredRecentPlayOnHydration = recentPlay;
};

interface RecentPlaysStore {
  recentPlays: RecentPlay[];
  addRecentPlay: (recentPlay: RecentPlay) => void;
  insertRecentPlayAtTop: (recentPlay: RecentPlay) => void;
  clearRecentPlays: () => void;
}

// Capture store reference for use in persist callbacks
let storeRef: { getState: () => RecentPlaysStore } | null = null;

const useRecentPlaysBase = create<RecentPlaysStore>()(
  persist(
    (set, _get, store) => {
      storeRef = store as unknown as { getState: () => RecentPlaysStore };
      const pinFavoritesAndCap = (items: RecentPlay[]): RecentPlay[] => {
        const capped = items.slice(0, 8);
        const favIndex = capped.findIndex((p) => p.id === "favorites");
        if (favIndex > 0) {
          const [fav] = capped.splice(favIndex, 1);
          capped.unshift(fav);
        }
        return capped;
      };
      return {
        recentPlays: [],
        addRecentPlay: (recentPlay: RecentPlay) => {
          set((state) => {
            if (state.recentPlays.some((play) => play.id === recentPlay.id)) {
              return { recentPlays: pinFavoritesAndCap(state.recentPlays) };
            }
            const newRecentPlays = [recentPlay, ...state.recentPlays];
            return { recentPlays: pinFavoritesAndCap(newRecentPlays) };
          });
        },
        insertRecentPlayAtTop: (recentPlay: RecentPlay) => {
          set((state) => {
            const withoutDuplicate = state.recentPlays.filter(
              (play) => play.id !== recentPlay.id,
            );
            const newRecentPlays = [recentPlay, ...withoutDuplicate];
            return { recentPlays: pinFavoritesAndCap(newRecentPlays) };
          });
        },
        clearRecentPlays: () => {
          set((state) => {
            return { recentPlays: state.recentPlays.filter((play) => play.id !== "favorites") };
          });
        },
      };
    },
    {
      name: "recentPlays",
      storage: createJSONStorage(() => zustandStorage),
      onRehydrateStorage: () => {
        return () => {
          if (!ensuredRecentPlayOnHydration) return;
          const state = (
            storeRef as { getState: () => RecentPlaysStore }
          ).getState();
          const exists = state.recentPlays.some(
            (play: RecentPlay) => play.id === ensuredRecentPlayOnHydration?.id,
          );
          if (!exists) {
            state.insertRecentPlayAtTop(ensuredRecentPlayOnHydration);
          }
        };
      },
    },
  ),
);

const useRecentPlays = createSelectors(useRecentPlaysBase);

export default useRecentPlays;
