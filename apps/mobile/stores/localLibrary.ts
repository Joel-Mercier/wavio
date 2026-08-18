import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LOCAL_AUTH_SCOPE } from "@/config/authScope";
import { createDynamicScopedStorage, storage } from "@/config/storage";
import { isSingletonServerType } from "@/services/backend/serverTraits";
import type { ScanPhase, ScanResult } from "@/services/local/indexer";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import type { ServerType } from "@/stores/servers";
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
  /** Directories walked so far, during the listing phase. */
  directories?: number;
  /**
   * Why the scan failed, as a code the UI maps to copy.
   *
   * A code rather than a message: this used to hold `String(error)`, which the
   * gate rendered verbatim — so a user on cellular was shown the literal string
   * `ERR_SCAN_METERED_NETWORK`, and everything else showed a raw AxiosError.
   * `ERR_SCAN_*` values are the scanner's own; the rest come from
   * services/fileSource/errors.
   */
  errorCode?: string;
  /**
   * Present only when there is genuinely nothing better to say — an unclassified
   * throw. Shown as supporting detail under a generic message, never alone.
   */
  errorDetail?: string;
};

const STORE_NAME = "localLibraryStore";

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
  // A scan just finished without seeing the whole library (a folder wouldn't
  // list). Nothing was pruned, but the result is partial and the user should be
  // told rather than shown a quietly smaller library. Consumed once and cleared.
  incompleteScanNotice: boolean;

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
  /** Dismiss the one-shot partial-scan warning once it's been shown. */
  clearIncompleteScanNotice: () => void;
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
  incompleteScanNotice: false,
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
          // Raised here rather than in the gate because the gate unmounts the
          // instant `lastScanAt` is stamped — it never gets to say anything.
          // One-shot and ephemeral: the warning is about what just happened, and
          // re-announcing it on every cold start would be noise.
          incompleteScanNotice: result.incomplete,
        });
      },

      clearIncompleteScanNotice: () => {
        set({ incompleteScanNotice: false });
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
      name: STORE_NAME,
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

/**
 * Re-open the indexing gate for a specific saved server, active or not.
 *
 * Editing a share's scanned sub-path (or a local library's folders) has to
 * reconcile *that* server's index, but this store is scope-bound: a bare
 * `requestRescan` clears the stamp of whichever library is signed in right now
 * and leaves the edited one untouched — so the wrong library rescans and the
 * edited one keeps serving files outside its new path.
 *
 * For a non-active server the stamp is dropped straight out of the target
 * scope's persisted blob, so the gate opens the next time that server is
 * entered. Storage rather than the module-level `flagLocalRescanOnEntry` seam
 * the login screen uses, because that entry may be days and an app restart away.
 */
export function requestRescanForServer(
  serverId: string,
  type: ServerType,
): void {
  if (serverId === useAuthBase.getState().serverId) {
    useLocalLibraryBase.getState().requestRescan(false);
    return;
  }
  const current = currentAuthScope();
  for (const scope of scopesForServer(serverId, type)) {
    if (scope === current) continue;
    clearPersistedScanStamp(scope);
  }
}

// A singleton type has no id in its scope; every other type may have several
// scopes for one server (one per user), and a user who has signed in but isn't
// in the servers store still owns a bucket — so the scopes are read back off
// storage rather than derived from the users list. Mirrors the recovery scan in
// services/storageScopeMigration.ts.
function scopesForServer(serverId: string, type: ServerType): string[] {
  if (isSingletonServerType(type)) return [LOCAL_AUTH_SCOPE];
  const prefix = `${serverId.replace(/[^a-zA-Z0-9]/g, "_")}_`;
  const suffix = `:${STORE_NAME}`;
  const scopes: string[] = [];
  for (const key of storage.getAllKeys()) {
    if (!key.endsWith(suffix)) continue;
    const scope = key.slice(0, -suffix.length);
    if (scope.startsWith(prefix)) scopes.push(scope);
  }
  return scopes;
}

// The keys are deleted rather than set to null: `lastScanAt: undefined` is what
// the gate tests for, and that is exactly what rehydrating a blob without them
// produces (JSON.stringify drops undefined, so this is the shape persist itself
// writes). Favourites and ratings in the same blob are left alone.
function clearPersistedScanStamp(scope: string): void {
  const key = `${scope}:${STORE_NAME}`;
  const raw = storage.getString(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      state?: Record<string, unknown>;
    };
    if (!parsed.state) return;
    delete parsed.state.lastScanAt;
    delete parsed.state.lastScanResult;
    storage.set(key, JSON.stringify(parsed));
  } catch {
    // A blob we can't parse is one persist will discard on rehydrate anyway,
    // which leaves `lastScanAt` undefined — the gate opens either way.
  }
}
