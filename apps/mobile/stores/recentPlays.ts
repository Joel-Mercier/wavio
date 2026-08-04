import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type RecentPlay = {
  id: string;
  title: string;
  type: "album" | "artist" | "playlist" | "favorites" | "internetRadioStation";
  coverArt?: string;
  homePageUrl?: string;
  streamUrl?: string;
  // Extra internet-radio metadata so the home shortcut can reopen the detail
  // screen with everything it needs (esp. Radio-Browser stations).
  source?: "server" | "radioBrowser";
  tags?: string;
  country?: string;
  countrySubdivision?: string;
  languages?: string;
};

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
  __reset: () => void;
}

let storeRef: { getState: () => RecentPlaysStore } | null = null;

const useRecentPlaysBase = create<RecentPlaysStore>()(
  persist(
    (set, get, store) => {
      storeRef = store as unknown as { getState: () => RecentPlaysStore };
      // Returns the input array itself when it already satisfies the invariant,
      // so callers can tell "nothing changed" apart from "rebuilt identically"
      // and skip the set() entirely.
      const pinFavoritesAndCap = (items: RecentPlay[]): RecentPlay[] => {
        const capped = items.length > 8 ? items.slice(0, 8) : items;
        const favIndex = capped.findIndex((p) => p.id === "favorites");
        if (favIndex <= 0) return capped;
        const pinned = capped.slice();
        const [fav] = pinned.splice(favIndex, 1);
        pinned.unshift(fav);
        return pinned;
      };
      return {
        recentPlays: [],
        addRecentPlay: (recentPlay: RecentPlay) => {
          const { recentPlays } = get();
          if (recentPlays.some((play) => play.id === recentPlay.id)) {
            const normalized = pinFavoritesAndCap(recentPlays);
            // Re-adding an entry that is already there is a no-op. Return
            // before set() rather than from inside it: persist wraps set() so
            // that it always writes the whole list back to MMKV, even when
            // zustand skips notifying subscribers. Screens call this on every
            // play, so that write (and waking every listener, including the
            // Android Auto tree rebuild, which hits the server) is pure waste.
            if (normalized === recentPlays) return;
            set({ recentPlays: normalized });
            return;
          }
          set((state) => {
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
            return {
              recentPlays: state.recentPlays.filter(
                (play) => play.id === "favorites",
              ),
            };
          });
        },
        __reset: () => {
          set({ recentPlays: [] });
        },
      };
    },
    {
      name: "recentPlays",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
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
      skipHydration: true,
    },
  ),
);

const useRecentPlays = createSelectors(useRecentPlaysBase);

export default useRecentPlays;
