import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import type { ScanPhase, ScanResult } from "@/services/local/indexer";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Scan state for the on-device local-library feature. The source folders are
// configured on the local *server* entry (stores/servers.ts → Server.paths),
// and the track index itself lives in SQLite (services/local/*); this store
// only tracks scanning:
//  - persisted (scoped per server+user like every other store): a small summary
//    of the last scan.
//  - ephemeral: live scan progress, reset on every app start.

export type ScanStatus = {
  phase: ScanPhase | "idle";
  processed: number;
  total: number;
  currentFile?: string;
  error?: string;
};

const idleStatus: ScanStatus = { phase: "idle", processed: 0, total: 0 };

/** Maps a starred id to the epoch-ms timestamp it was favourited at. */
export type FavoriteMap = Record<string, number>;

/** Maps a rated id (track/album/artist) to its 1–5 star rating. */
export type RatingMap = Record<string, number>;

/** Star/unstar target, matching the OpenSubsonic star/unstar params. */
export type StarTarget = { id?: string; albumId?: string; artistId?: string };

interface LocalLibraryStore {
  // --- persisted ---
  lastScanAt: number | undefined;
  lastScanResult: ScanResult | undefined;
  // The local backend has no server to track favourites, so star state lives
  // here (scoped per server+user like the rest of the store). Keyed by the
  // local track/album/artist id → when it was starred, so getStarred can sort
  // and the mappers can stamp the `starred` field across the app.
  favoriteTracks: FavoriteMap;
  favoriteAlbums: FavoriteMap;
  favoriteArtists: FavoriteMap;
  // Likewise, the local backend has no server to store ratings, so user ratings
  // (1–5) live here keyed by the local track/album/artist id. The mappers stamp
  // `userRating` from this map and getAlbumList2 type=highest sorts by it.
  ratings: RatingMap;

  // --- ephemeral ---
  status: ScanStatus;
  // True once this scope's persisted summary has been rehydrated, so consumers
  // can tell "first login, never scanned" (`ready && lastScanAt === undefined`)
  // apart from "still loading the saved scan summary".
  ready: boolean;

  setStatus: (status: ScanStatus) => void;
  setScanFinished: (result: ScanResult) => void;
  setReady: () => void;
  star: (target: StarTarget) => void;
  unstar: (target: StarTarget) => void;
  /** Set a 1–5 rating for a local id; a rating of 0 clears it (Subsonic). */
  setRating: (id: string, rating: number) => void;
  __reset: () => void;
}

const initialState = {
  lastScanAt: undefined as number | undefined,
  lastScanResult: undefined as ScanResult | undefined,
  favoriteTracks: {} as FavoriteMap,
  favoriteAlbums: {} as FavoriteMap,
  favoriteArtists: {} as FavoriteMap,
  ratings: {} as RatingMap,
  status: idleStatus,
  ready: false,
};

const useLocalLibraryBase = create<LocalLibraryStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setStatus: (status) => {
        set({ status });
      },

      setReady: () => {
        set({ ready: true });
      },

      setScanFinished: (result) => {
        set({
          status: idleStatus,
          lastScanAt: Date.now(),
          lastScanResult: result,
        });
      },

      star: ({ id, albumId, artistId }) => {
        const now = Date.now();
        set((s) => ({
          favoriteTracks: id
            ? { ...s.favoriteTracks, [id]: now }
            : s.favoriteTracks,
          favoriteAlbums: albumId
            ? { ...s.favoriteAlbums, [albumId]: now }
            : s.favoriteAlbums,
          favoriteArtists: artistId
            ? { ...s.favoriteArtists, [artistId]: now }
            : s.favoriteArtists,
        }));
      },

      unstar: ({ id, albumId, artistId }) => {
        set((s) => {
          const drop = (map: FavoriteMap, key?: string): FavoriteMap => {
            if (!key || !(key in map)) return map;
            const { [key]: _, ...rest } = map;
            return rest;
          };
          return {
            favoriteTracks: drop(s.favoriteTracks, id),
            favoriteAlbums: drop(s.favoriteAlbums, albumId),
            favoriteArtists: drop(s.favoriteArtists, artistId),
          };
        });
      },

      setRating: (id, rating) => {
        set((s) => {
          if (rating <= 0) {
            if (!(id in s.ratings)) return s;
            const { [id]: _, ...rest } = s.ratings;
            return { ratings: rest };
          }
          return { ratings: { ...s.ratings, [id]: rating } };
        });
      },
    }),
    {
      name: "localLibraryStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
      // Never persist live scan progress.
      partialize: (state) => ({
        lastScanAt: state.lastScanAt,
        lastScanResult: state.lastScanResult,
        favoriteTracks: state.favoriteTracks,
        favoriteAlbums: state.favoriteAlbums,
        favoriteArtists: state.favoriteArtists,
        ratings: state.ratings,
      }),
    },
  ),
);

const useLocalLibrary = createSelectors(useLocalLibraryBase);

export default useLocalLibrary;
