import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Crawl state for the extended-offline library sync (see
// services/offline/librarySyncService.ts). Scoped per (server, user) like the
// offline store, and deliberately slim: discovered albums/playlists are
// registered straight into the offline store's downloadedCollections, and the
// download queue never holds more than about a page of tracks — only the
// cursor needed to resume the crawl across restarts lives here.

export type LibrarySyncPhase =
  | "idle"
  | "albums"
  | "songs"
  | "playlists"
  | "complete";

// Error codes rather than messages so the settings row can localize them.
export type LibrarySyncErrorCode = "diskFull" | "unsupported" | "syncFailed";

export type SeenIdKind = "album" | "song" | "playlist";

export type LibrarySyncCrawlState = {
  phase: LibrarySyncPhase;
  albumOffset: number;
  songOffset: number;
  // Σ songCount over the enumerated albums — the progress denominator,
  // available as soon as the (fast) albums phase completes.
  totalSongs: number;
  // Songs the crawl has enumerated and handed to the download queue.
  processedSongs: number;
  // Every id the current pass has seen, per kind. The server is the source of
  // truth: when a pass completes, auto content whose id was never seen has
  // been deleted server-side and is removed locally (planServerDeletions).
  // Persisted with the cursor so a resumed pass keeps its inventory; cleared
  // on completion to keep the persisted blob small. A re-crawled page may
  // append duplicates — reconciliation reads these as sets.
  seenAlbumIds: string[];
  seenSongIds: string[];
  seenPlaylistIds: string[];
  lastSyncCompletedAt: string | null;
  lastError: LibrarySyncErrorCode | null;
};

interface LibrarySyncStore extends LibrarySyncCrawlState {
  extendedOfflineModeEnabled: boolean;
  setExtendedOfflineModeEnabled: (enabled: boolean) => void;
  setCrawl: (partial: Partial<LibrarySyncCrawlState>) => void;
  appendSeenIds: (kind: SeenIdKind, ids: string[]) => void;
  resetCursor: () => void;
  __reset: () => void;
}

const initialCrawlState: LibrarySyncCrawlState = {
  phase: "idle",
  albumOffset: 0,
  songOffset: 0,
  totalSongs: 0,
  processedSongs: 0,
  seenAlbumIds: [],
  seenSongIds: [],
  seenPlaylistIds: [],
  lastSyncCompletedAt: null,
  lastError: null,
};

const initialLibrarySyncState = {
  extendedOfflineModeEnabled: false,
  ...initialCrawlState,
};

export const useLibrarySyncBase = create<LibrarySyncStore>()(
  persist(
    (set) => ({
      ...initialLibrarySyncState,

      __reset: () => {
        set(() => ({ ...initialLibrarySyncState }));
      },

      setExtendedOfflineModeEnabled: (enabled) => {
        set({ extendedOfflineModeEnabled: enabled });
      },

      setCrawl: (partial) => {
        set(partial);
      },

      appendSeenIds: (kind, ids) => {
        if (ids.length === 0) return;
        set((state) => {
          switch (kind) {
            case "album":
              return { seenAlbumIds: [...state.seenAlbumIds, ...ids] };
            case "song":
              return { seenSongIds: [...state.seenSongIds, ...ids] };
            case "playlist":
              return { seenPlaylistIds: [...state.seenPlaylistIds, ...ids] };
          }
        });
      },

      // Rewind to the start of a fresh pass; keeps lastSyncCompletedAt so a
      // delta resync still knows when the library was last fully synced.
      resetCursor: () => {
        set((state) => ({
          ...initialCrawlState,
          lastSyncCompletedAt: state.lastSyncCompletedAt,
        }));
      },
    }),
    {
      name: "librarySyncStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
    },
  ),
);

const useLibrarySync = createSelectors(useLibrarySyncBase);

export default useLibrarySync;
