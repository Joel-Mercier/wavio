import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MAX_HOME_SHORTCUTS } from "@/config/homeShortcuts";
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

const FAVORITES_RECENT_PLAY: RecentPlay = {
  id: "favorites",
  title: "Favorites",
  type: "favorites",
};

// Mirrors the pinFavoritesShortcut setting (services/homeShortcuts.ts) rather
// than reading stores/app, which would pull i18n and MMKV into every importer.
let favoritesPinned = true;

export const setFavoritesPinned = (pinned: boolean) => {
  favoritesPinned = pinned;
};

// The entry to move to the top so Favorites leads the list, or null when it
// already does.
const favoritesToPin = (items: RecentPlay[]): RecentPlay | null =>
  items[0]?.id === FAVORITES_RECENT_PLAY.id
    ? null
    : (items.find((play) => play.id === FAVORITES_RECENT_PLAY.id) ??
      FAVORITES_RECENT_PLAY);

interface RecentPlaysStore {
  recentPlays: RecentPlay[];
  addRecentPlay: (recentPlay: RecentPlay) => void;
  refreshRecentPlay: (recentPlay: RecentPlay) => void;
  insertRecentPlayAtTop: (recentPlay: RecentPlay) => void;
  pinFavorites: () => void;
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

const useRecentPlaysBase = create<RecentPlaysStore>()(
  persist(
    (set, get, store) => {
      // Returns the input array itself when it already satisfies the invariant,
      // so callers can tell "nothing changed" apart from "rebuilt identically"
      // and skip the set() entirely. Pins before capping, so a pinned entry the
      // list has not yet moved up (a scope rehydrated while it was unpinned)
      // can't be cut.
      const pinFavoritesAndCap = (items: RecentPlay[]): RecentPlay[] => {
        const favIndex = favoritesPinned
          ? items.findIndex((p) => p.id === "favorites")
          : -1;
        const pinned =
          favIndex > 0
            ? [
                items[favIndex],
                ...items.slice(0, favIndex),
                ...items.slice(favIndex + 1),
              ]
            : items;
        return pinned.length > MAX_HOME_SHORTCUTS
          ? pinned.slice(0, MAX_HOME_SHORTCUTS)
          : pinned;
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
        // Writing before hydration would persist this list over the scope's
        // stored one, so an unhydrated store picks the pin up on rehydrate.
        pinFavorites: () => {
          if (!store.persist.hasHydrated()) return;
          const favorites = favoritesToPin(get().recentPlays);
          if (favorites) get().insertRecentPlayAtTop(favorites);
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
              recentPlays: favoritesPinned
                ? state.recentPlays.filter((play) => play.id === "favorites")
                : [],
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
        // A scope last written while unpinned can hold Favorites below the
        // top, so check its position, not just its presence.
        return (state) => {
          if (!state || !favoritesPinned) return;
          const favorites = favoritesToPin(state.recentPlays);
          if (favorites) state.insertRecentPlayAtTop(favorites);
        };
      },
      skipHydration: true,
    },
  ),
);

const useRecentPlays = createSelectors(useRecentPlaysBase);

export default useRecentPlays;
