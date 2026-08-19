import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// The index for the prefetch cache (issue #163): tracks pulled to disk ahead of
// playback so a reception dropout mid-queue is silent instead of a stall.
//
// Deliberately NOT part of stores/offline.ts, and deliberately imported by
// nothing under components/. Every download badge, "Remove download" menu item,
// Offline downloads row and offline-library listing in the app derives from
// `offline.downloadedTracks` — so keeping cache entries in their own store makes
// them invisible to that UI by construction rather than by discipline. The two
// promises are different: a download is user-owned and permanent, a cache entry
// is speculative and evictable at any moment.

export type TrackCacheEntry = {
  id: string;
  /** file:// URI of the cached copy. */
  path: string;
  bytes: number;
  /** Container the copy was saved with, as reported by the server. */
  suffix: string;
  cachedAt: number;
  /** Drives the recency half of the eviction score. */
  lastPlayedAt: number;
  /** Drives the frequency half. Incremented on every play off this entry. */
  playCount: number;
};

interface TrackCacheStore {
  entries: Record<string, TrackCacheEntry>;
  /** Sum of `entries[*].bytes`, maintained incrementally. */
  totalBytes: number;

  putEntry: (entry: TrackCacheEntry) => void;
  /** Records a play: bumps recency and frequency for the eviction score. */
  touchEntry: (trackId: string) => void;
  removeEntries: (trackIds: string[]) => void;
  clearEntries: () => void;

  getEntry: (trackId: string) => TrackCacheEntry | null;
  isCached: (trackId: string) => boolean;
  getEntriesList: () => TrackCacheEntry[];

  __reset: () => void;
}

const sumBytes = (entries: Record<string, TrackCacheEntry>): number =>
  Object.values(entries).reduce((total, entry) => total + entry.bytes, 0);

const useTrackCacheBase = create<TrackCacheStore>()(
  persist(
    (set, get) => ({
      entries: {},
      totalBytes: 0,

      putEntry: (entry) => {
        set((state) => {
          const previous = state.entries[entry.id];
          return {
            entries: { ...state.entries, [entry.id]: entry },
            totalBytes: state.totalBytes - (previous?.bytes ?? 0) + entry.bytes,
          };
        });
      },

      touchEntry: (trackId) => {
        set((state) => {
          const entry = state.entries[trackId];
          if (!entry) return state;
          return {
            entries: {
              ...state.entries,
              [trackId]: {
                ...entry,
                lastPlayedAt: Date.now(),
                playCount: entry.playCount + 1,
              },
            },
          };
        });
      },

      removeEntries: (trackIds) => {
        if (trackIds.length === 0) return;
        set((state) => {
          const entries = { ...state.entries };
          let freed = 0;
          for (const trackId of trackIds) {
            const entry = entries[trackId];
            if (!entry) continue;
            freed += entry.bytes;
            delete entries[trackId];
          }
          if (
            freed === 0 &&
            Object.keys(entries).length === Object.keys(state.entries).length
          ) {
            return state;
          }
          return { entries, totalBytes: Math.max(0, state.totalBytes - freed) };
        });
      },

      clearEntries: () => {
        set({ entries: {}, totalBytes: 0 });
      },

      getEntry: (trackId) => get().entries[trackId] ?? null,

      isCached: (trackId) => trackId in get().entries,

      getEntriesList: () => Object.values(get().entries),

      __reset: () => {
        set({ entries: {}, totalBytes: 0 });
      },
    }),
    {
      name: "trackCacheStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({ entries: state.entries }),
      // `totalBytes` is derived, so it isn't persisted — recomputing it once on
      // rehydrate is cheaper than keeping a second copy honest across the
      // partial writes that a crash mid-prune can leave behind.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.totalBytes = sumBytes(state.entries);
      },
    },
  ),
);

const useTrackCache = createSelectors(useTrackCacheBase);

export { useTrackCacheBase };
export default useTrackCache;
