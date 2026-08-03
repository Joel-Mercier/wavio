import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { SongEnumerationCalibration } from "@/services/offline/librarySyncPlan";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Crawl state for the extended-offline library sync (see
// services/offline/librarySyncService.ts). Scoped per (server, user) like the
// offline store, and deliberately slim: discovered albums/playlists are
// registered straight into the offline store's downloadedCollections, and the
// download queue never holds more than about a page of tracks — only the
// cursor needed to resume the crawl across restarts lives here.

// Phase order is albums → artists → playlists → songs. Everything that makes
// the library *browsable* offline (collections and their artwork) is enumerated
// first and cheaply; the songs phase runs last because it paces itself to
// download speed and can take hours on a large library.
export type LibrarySyncPhase =
  | "idle"
  | "albums"
  | "artists"
  | "playlists"
  | "songs"
  | "complete";

// Error codes rather than messages so the settings row can localize them.
export type LibrarySyncErrorCode = "diskFull" | "unsupported" | "syncFailed";

export type SeenIdKind = "album" | "song" | "playlist";

// Navidrome's canonical-id migration renumbers most song ids server-side, which
// would make every persisted id dangle (see services/navidromeIdMigration.ts).
// "checking" is the frozen state: a probe is scheduled or in flight and nothing
// may read "id not found" as "content deleted" — most importantly this store's
// own seenSongIds, which planServerDeletions would otherwise use to delete every
// auto-downloaded file. "migrated" is informational and behaves like "idle".
export type IdMigrationStatus = "idle" | "checking" | "migrated";

export type IdMigrationState = {
  // The raw serverVersion string last observed. Compared by *inequality*, not
  // by semver ordering: develop builds carry a git sha rather than a sequential
  // version, so a threshold comparison would skip exactly the users who hit the
  // migration first.
  lastSeenServerVersion: string | null;
  lastProbedAt: number | null;
  idMigration: IdMigrationStatus;
};

export type LibrarySyncCrawlState = {
  phase: LibrarySyncPhase;
  albumOffset: number;
  songOffset: number;
  // Σ songCount over the enumerated albums — the progress denominator,
  // available as soon as the (fast) albums phase completes.
  totalSongs: number;
  // Σ songCount as reported by the albums phase alone. totalSongs is raised to
  // whatever the songs phase actually enumerated (so the progress bar never
  // exceeds 100%), which destroys the independent estimate — this keeps it, so
  // completion of the songs enumeration can be cross-checked before the pass
  // is allowed to delete anything.
  albumSongEstimate: number;
  // False once any phase looks like it enumerated less than the server holds.
  // Such a pass may not reconcile deletions: its gaps are indistinguishable
  // from server-side removals and would delete cached content. Reset per pass.
  passTrusted: boolean;
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
  // Downloaded-track count when the pass started; compared on completion to
  // detect a pass that actually downloaded something (→ "library cached"
  // toast) vs a no-op resync. Persisted so a sync spanning app restarts still
  // notifies; null once the completion has been evaluated.
  passStartDownloadedCount: number | null;
  lastSyncCompletedAt: string | null;
  lastError: LibrarySyncErrorCode | null;
};

// How many songs this server actually enumerates, measured rather than assumed.
// The albums phase's Σ songCount is only a bootstrap for it: that figure counts
// rows the server will never serve (Navidrome keeps `missing` media_files in
// album.songCount long after the files are gone), and the resulting skew is
// permanent — a library that has ever been reorganised would fail the songs
// completeness check on every pass and never reconcile deletions again.
export type LibrarySyncCalibrationState = SongEnumerationCalibration & {
  // The previous completed pass's raw count, used to corroborate a *lower*
  // baseline before adopting it. See nextSongCalibration.
  lastPassSongCount: number | null;
};

interface LibrarySyncStore
  extends LibrarySyncCrawlState,
    IdMigrationState,
    LibrarySyncCalibrationState {
  extendedOfflineModeEnabled: boolean;
  setExtendedOfflineModeEnabled: (enabled: boolean) => void;
  setCrawl: (partial: Partial<LibrarySyncCrawlState>) => void;
  appendSeenIds: (kind: SeenIdKind, ids: string[]) => void;
  setIdMigration: (partial: Partial<IdMigrationState>) => void;
  setCalibration: (partial: Partial<LibrarySyncCalibrationState>) => void;
  resetCursor: () => void;
  __reset: () => void;
}

// Deliberately not part of initialCrawlState: resetCursor() rewinds the crawl
// between passes and must not forget that this scope was already migrated.
const initialIdMigrationState: IdMigrationState = {
  lastSeenServerVersion: null,
  lastProbedAt: null,
  idMigration: "idle",
};

// Deliberately not part of initialCrawlState, for the same reason as the id
// migration slice: resetCursor() rewinds the crawl between passes, and the
// calibration describes the *server*, not the pass — re-measuring it from
// scratch every pass would defeat it entirely.
const initialCalibrationState: LibrarySyncCalibrationState = {
  enumerableSongCount: null,
  calibratedAlbumSongEstimate: null,
  lastPassSongCount: null,
};

const initialCrawlState: LibrarySyncCrawlState = {
  phase: "idle",
  albumOffset: 0,
  songOffset: 0,
  totalSongs: 0,
  albumSongEstimate: 0,
  passTrusted: true,
  processedSongs: 0,
  seenAlbumIds: [],
  seenSongIds: [],
  seenPlaylistIds: [],
  passStartDownloadedCount: null,
  lastSyncCompletedAt: null,
  lastError: null,
};

const initialLibrarySyncState = {
  extendedOfflineModeEnabled: false,
  ...initialCrawlState,
  ...initialIdMigrationState,
  ...initialCalibrationState,
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

      setIdMigration: (partial) => {
        set(partial);
      },

      setCalibration: (partial) => {
        set(partial);
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

/**
 * True while a canonical-id probe is scheduled or in flight. Every reconciler
 * that treats "the server doesn't know this id" as "the content was deleted"
 * must bail out on this, or it will delete content that was merely renumbered.
 *
 * Lives here rather than in services/navidromeIdMigration.ts so the reconcilers
 * can read it without importing the migration (and its store graph).
 */
export const isIdMigrationFrozen = (): boolean =>
  useLibrarySyncBase.getState().idMigration === "checking";

const useLibrarySync = createSelectors(useLibrarySyncBase);

export default useLibrarySync;
