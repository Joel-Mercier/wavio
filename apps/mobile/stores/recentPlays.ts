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
  refreshRecentPlay: (recentPlay: RecentPlay) => void;
  insertRecentPlayAtTop: (recentPlay: RecentPlay) => void;
  removeRecentPlay: (id: string) => void;
  clearRecentPlays: () => void;
  __reset: () => void;
}

const RECENT_PLAY_FIELDS = [
  "title",
  "type",
  "coverArt",
  "homePageUrl",
  "streamUrl",
  "source",
  "tags",
  "country",
  "countrySubdivision",
  "languages",
] as const satisfies readonly Exclude<keyof RecentPlay, "id">[];

const sameRecentPlay = (a: RecentPlay, b: RecentPlay) =>
  RECENT_PLAY_FIELDS.every((field) => a[field] === b[field]);

// Refresh an entry's metadata in place, keeping its position. Fields the caller
// left undefined keep the value already stored: call sites race async metadata
// (a Radio-Browser station's artwork is scraped from its homepage), and a
// partial payload must not blank a shortcut that already has the full picture.
// Returns the input array itself when there is nothing to update, so callers
// can tell "unchanged" apart from "rebuilt identically" and skip the set().
const withRefreshedEntry = (
  items: RecentPlay[],
  entry: RecentPlay,
): RecentPlay[] => {
  const existing = items.find((play) => play.id === entry.id);
  if (!existing) return items;
  const merged: RecentPlay = {
    ...existing,
    ...(Object.fromEntries(
      Object.entries(entry).filter(([, value]) => value !== undefined),
    ) as Partial<RecentPlay>),
  };
  if (sameRecentPlay(existing, merged)) return items;
  return items.map((play) => (play.id === entry.id ? merged : play));
};

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
            const normalized = pinFavoritesAndCap(
              withRefreshedEntry(recentPlays, recentPlay),
            );
            // Re-adding an entry that is already there only refreshes its
            // metadata, and is otherwise a no-op. Return before set() rather
            // than from inside it: persist wraps set() so that it always writes
            // the whole list back to MMKV, even when zustand skips notifying
            // subscribers. Screens call this on every play, so that write (and
            // waking every listener, including the Android Auto tree rebuild,
            // which hits the server) is pure waste.
            if (normalized === recentPlays) return;
            set({ recentPlays: normalized });
            return;
          }
          set((state) => {
            const newRecentPlays = [recentPlay, ...state.recentPlays];
            return { recentPlays: pinFavoritesAndCap(newRecentPlays) };
          });
        },
        // Keep an existing shortcut's metadata in step with the server without
        // promoting the item to "recently played": browsing a renamed playlist
        // updates its shortcut, browsing a new one doesn't create one.
        refreshRecentPlay: (recentPlay: RecentPlay) => {
          const { recentPlays } = get();
          const refreshed = withRefreshedEntry(recentPlays, recentPlay);
          if (refreshed === recentPlays) return;
          set({ recentPlays: refreshed });
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
        removeRecentPlay: (id: string) => {
          const { recentPlays } = get();
          const remaining = recentPlays.filter((play) => play.id !== id);
          // Same reasoning as addRecentPlay: nothing matched, so skip the set()
          // that would rewrite MMKV and wake the widget / car browse tree.
          if (remaining.length === recentPlays.length) return;
          set({ recentPlays: remaining });
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
