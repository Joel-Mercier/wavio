import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { ScanPhase, ScanResult } from "@/services/local/indexer";
import { currentAuthScope } from "@/stores/auth";
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
  // Whether the next gate scan should force a full re-extraction (explicit
  // settings "rescan") vs an incremental one (a folder change only needs new
  // files indexed). Ephemeral — reset per app start.
  forceNextScan: boolean;

  setStatus: (status: ScanStatus) => void;
  setScanFinished: (result: ScanResult) => void;
  setReady: () => void;
  /**
   * Clear the last-scan stamp so the full-screen indexing gate
   * (components/local/LocalLibraryIndexing) re-opens and runs a fresh scan.
   * Used by the settings "rescan" action and whenever the source folders change.
   * `force` re-extracts every file (settings rescan); the default incremental
   * scan only indexes new/changed files (a folder add/remove).
   */
  requestRescan: (force?: boolean) => void;
  star: (target: StarTarget) => void;
  unstar: (target: StarTarget) => void;
  /** Set a 1–5 rating for a local id; a rating of 0 clears it (Subsonic). */
  setRating: (id: string, rating: number) => void;
  /**
   * Wipe this scope's favourites/ratings and scan stamp (keeping `ready`) when
   * the local server is deleted, so a re-added local library starts clean. Kept
   * separate from `__reset` because that also clears `ready`, which would strand
   * the indexing gate on a same-scope re-login that skips rehydration.
   */
  clearLocalLibraryData: () => void;
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
  forceNextScan: false,
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

      requestRescan: (force = false) => {
        set({
          lastScanAt: undefined,
          lastScanResult: undefined,
          forceNextScan: force,
        });
      },

      setScanFinished: (result) => {
        set({
          status: idleStatus,
          lastScanAt: Date.now(),
          lastScanResult: result,
          forceNextScan: false,
        });
      },

      clearLocalLibraryData: () => {
        set({
          lastScanAt: undefined,
          lastScanResult: undefined,
          favoriteTracks: {},
          favoriteAlbums: {},
          favoriteArtists: {},
          ratings: {},
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
        createDynamicScopedStorage(currentAuthScope),
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

// One-shot signal that the source folders changed on the login screen, so the
// app layout should force a rescan once the local-library store has rehydrated.
// Module-level (not store state) so a scope-change `__reset` can't wipe it
// between login and the post-hydration consumer in app/(app)/_layout.tsx.
let pendingLocalRescan = false;

export function flagLocalRescanOnEntry(): void {
  pendingLocalRescan = true;
}

export function consumeLocalRescanFlag(): boolean {
  const pending = pendingLocalRescan;
  pendingLocalRescan = false;
  return pending;
}
