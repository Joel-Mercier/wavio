import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { Child } from "@/services/openSubsonic/types";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Who caused a track/collection to be downloaded. "user" = an explicit save
// (single-track download, "Save for offline" on a collection, starred
// auto-sync); "auto" = the extended-offline library sync. Absent means "user"
// so data persisted before the flag existed keeps its explicit-save semantics.
// Disabling extended offline mode removes only "auto" content.
export type OfflineSource = "user" | "auto";

export type OfflineTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration: number;
  coverArt?: string;
  path: string;
  size: number;
  downloadedAt: string;
  source?: OfflineSource;
  track?: number;
  discNumber?: number;
  metadata?: Record<string, unknown>;
};

export type OfflineCollection = {
  id: string;
  kind: "playlist" | "album";
  name: string;
  songCount: number;
  trackIds: string[];
  coverArt?: string;
  owner?: string;
  artist?: string;
  artistId?: string;
  // Every credited artist (AlbumID3.artists) — a multi-artist album belongs to
  // all of them, not just the primary artistId, so each stays browsable
  // offline.
  artists?: { id: string; name: string }[];
  year?: number;
  savedAt: string;
  source?: OfflineSource;
};

// Queue entries carry the source through app restarts (the queue is persisted),
// so a resumed auto download is still removable by disabling extended offline.
export type QueuedTrack = Child & { offlineSource?: OfflineSource };

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "paused";

export type DownloadProgress = {
  trackId: string;
  status: DownloadStatus;
  progress: number; // 0-100
  error?: string;
};

interface OfflineStore {
  offlineModeEnabled: boolean;
  setOfflineModeEnabled: (enabled: boolean) => void;

  downloadedTracks: Record<string, OfflineTrack>;
  addDownloadedTrack: (track: OfflineTrack) => void;
  addDownloadedTracks: (tracks: OfflineTrack[]) => void;
  removeDownloadedTrack: (trackId: string) => void;
  clearAllDownloads: () => void;

  downloadedCollections: Record<string, OfflineCollection>;
  addDownloadedCollection: (collection: OfflineCollection) => void;
  addDownloadedCollections: (collections: OfflineCollection[]) => void;
  appendCollectionTrackIds: (updates: Record<string, string[]>) => void;
  replaceCollectionTrackIds: (updates: Record<string, string[]>) => void;
  removeDownloadedCollection: (collectionId: string) => void;
  removeDownloadedCollections: (collectionIds: string[]) => void;
  getDownloadedCollections: () => OfflineCollection[];

  downloadProgress: Record<string, DownloadProgress>;
  setDownloadProgress: (trackId: string, progress: DownloadProgress) => void;
  setManyDownloadProgress: (entries: DownloadProgress[]) => void;
  removeDownloadProgress: (trackId: string) => void;
  clearFailedDownloads: () => void;

  downloadQueue: QueuedTrack[];
  addToDownloadQueue: (track: QueuedTrack) => void;
  addManyToDownloadQueue: (tracks: QueuedTrack[]) => void;
  setQueuedTrackSource: (trackId: string, source: OfflineSource) => void;
  removeFromDownloadQueue: (trackId: string) => void;
  removeManyFromDownloadQueue: (trackIds: string[]) => void;
  clearDownloadQueue: () => void;

  // Offline album/playlist covers downloaded by the extended-offline sync,
  // keyed by coverArt id → file:// URI (see utils/artwork.ts fallback).
  // artworkCachedAt records when each cover was fetched so stale covers get
  // re-fetched (Jellyfin coverArt ids are stable across image changes).
  artworkCache: Record<string, string>;
  artworkCachedAt: Record<string, string>;
  addCachedArtwork: (coverArtId: string, path: string) => void;
  removeCachedArtwork: (coverArtIds: string[]) => void;
  clearArtworkCache: () => void;

  isTrackDownloaded: (trackId: string) => boolean;
  getDownloadedTrack: (trackId: string) => OfflineTrack | null;
  getDownloadedTracksList: () => OfflineTrack[];
  getTotalDownloadSize: () => number;
  getDownloadedTracksCount: () => number;
  __reset: () => void;
}

const initialOfflineState = {
  offlineModeEnabled: false,
  downloadedTracks: {} as Record<string, OfflineTrack>,
  downloadedCollections: {} as Record<string, OfflineCollection>,
  downloadProgress: {} as Record<string, DownloadProgress>,
  downloadQueue: [] as QueuedTrack[],
  artworkCache: {} as Record<string, string>,
  artworkCachedAt: {} as Record<string, string>,
};

const useOfflineBase = create<OfflineStore>()(
  persist(
    (set, get) => ({
      ...initialOfflineState,

      __reset: () => {
        set(() => ({ ...initialOfflineState }));
      },

      setOfflineModeEnabled: (enabled) => {
        set({ offlineModeEnabled: enabled });
      },

      addDownloadedTrack: (track) => {
        set((state) => ({
          downloadedTracks: {
            ...state.downloadedTracks,
            [track.id]: track,
          },
        }));
      },

      addDownloadedTracks: (tracks) => {
        if (tracks.length === 0) return;
        set((state) => {
          const downloadedTracks = { ...state.downloadedTracks };
          for (const track of tracks) {
            downloadedTracks[track.id] = track;
          }
          return { downloadedTracks };
        });
      },

      removeDownloadedTrack: (trackId) => {
        set((state) => {
          const { [trackId]: _removed, ...remainingTracks } =
            state.downloadedTracks;
          return {
            downloadedTracks: remainingTracks,
          };
        });
      },

      clearAllDownloads: () => {
        set({
          downloadedTracks: {},
          downloadedCollections: {},
          downloadProgress: {},
          downloadQueue: [],
          artworkCache: {},
          artworkCachedAt: {},
        });
      },

      addCachedArtwork: (coverArtId, path) => {
        set((state) => ({
          artworkCache: {
            ...state.artworkCache,
            [coverArtId]: path,
          },
          artworkCachedAt: {
            ...state.artworkCachedAt,
            [coverArtId]: new Date().toISOString(),
          },
        }));
      },

      removeCachedArtwork: (coverArtIds) => {
        if (coverArtIds.length === 0) return;
        set((state) => {
          const artworkCache = { ...state.artworkCache };
          const artworkCachedAt = { ...state.artworkCachedAt };
          for (const coverArtId of coverArtIds) {
            delete artworkCache[coverArtId];
            delete artworkCachedAt[coverArtId];
          }
          return { artworkCache, artworkCachedAt };
        });
      },

      clearArtworkCache: () => {
        set({ artworkCache: {}, artworkCachedAt: {} });
      },

      addDownloadedCollection: (collection) => {
        set((state) => ({
          downloadedCollections: {
            ...state.downloadedCollections,
            [collection.id]: collection,
          },
        }));
      },

      // Bulk writes for the library sync: one store write (and one persist
      // serialization) per page instead of one per collection/track.
      addDownloadedCollections: (collections) => {
        if (collections.length === 0) return;
        set((state) => {
          const downloadedCollections = { ...state.downloadedCollections };
          for (const collection of collections) {
            downloadedCollections[collection.id] = collection;
          }
          return { downloadedCollections };
        });
      },

      appendCollectionTrackIds: (updates) => {
        set((state) => {
          const downloadedCollections = { ...state.downloadedCollections };
          let changed = false;
          for (const [collectionId, trackIds] of Object.entries(updates)) {
            const collection = downloadedCollections[collectionId];
            if (!collection) continue;
            const seen = new Set(collection.trackIds);
            const additions = trackIds.filter((id) => !seen.has(id));
            if (additions.length === 0) continue;
            downloadedCollections[collectionId] = {
              ...collection,
              trackIds: [...collection.trackIds, ...additions],
            };
            changed = true;
          }
          return changed ? { downloadedCollections } : state;
        });
      },

      replaceCollectionTrackIds: (updates) => {
        set((state) => {
          const downloadedCollections = { ...state.downloadedCollections };
          let changed = false;
          for (const [collectionId, trackIds] of Object.entries(updates)) {
            const collection = downloadedCollections[collectionId];
            if (!collection) continue;
            downloadedCollections[collectionId] = { ...collection, trackIds };
            changed = true;
          }
          return changed ? { downloadedCollections } : state;
        });
      },

      removeDownloadedCollection: (collectionId) => {
        set((state) => {
          const { [collectionId]: _removed, ...remaining } =
            state.downloadedCollections;
          return { downloadedCollections: remaining };
        });
      },

      removeDownloadedCollections: (collectionIds) => {
        if (collectionIds.length === 0) return;
        set((state) => {
          const removed = new Set(collectionIds);
          const downloadedCollections: Record<string, OfflineCollection> = {};
          for (const [id, collection] of Object.entries(
            state.downloadedCollections,
          )) {
            if (!removed.has(id)) downloadedCollections[id] = collection;
          }
          return { downloadedCollections };
        });
      },

      getDownloadedCollections: () => {
        const { downloadedCollections } = get();
        return Object.values(downloadedCollections);
      },

      setDownloadProgress: (trackId, progress) => {
        set((state) => ({
          downloadProgress: {
            ...state.downloadProgress,
            [trackId]: progress,
          },
        }));
      },

      setManyDownloadProgress: (entries) => {
        if (entries.length === 0) return;
        set((state) => {
          const downloadProgress = { ...state.downloadProgress };
          for (const entry of entries) {
            downloadProgress[entry.trackId] = entry;
          }
          return { downloadProgress };
        });
      },

      removeDownloadProgress: (trackId) => {
        set((state) => {
          const { [trackId]: _removed, ...remainingProgress } =
            state.downloadProgress;
          return {
            downloadProgress: remainingProgress,
          };
        });
      },

      clearFailedDownloads: () => {
        set((state) => {
          const remaining: Record<string, DownloadProgress> = {};
          for (const [id, progress] of Object.entries(state.downloadProgress)) {
            if (progress.status !== "failed") {
              remaining[id] = progress;
            }
          }
          return { downloadProgress: remaining };
        });
      },

      addToDownloadQueue: (track) => {
        set((state) => {
          if (state.downloadQueue.some((t) => t.id === track.id)) {
            return state;
          }
          return {
            downloadQueue: [...state.downloadQueue, track],
          };
        });
      },

      addManyToDownloadQueue: (tracks) => {
        if (tracks.length === 0) return;
        set((state) => {
          const seen = new Set(state.downloadQueue.map((t) => t.id));
          const additions = tracks.filter((t) => !seen.has(t.id));
          if (additions.length === 0) return state;
          return {
            downloadQueue: [...state.downloadQueue, ...additions],
          };
        });
      },

      setQueuedTrackSource: (trackId, source) => {
        set((state) => ({
          downloadQueue: state.downloadQueue.map((t) =>
            t.id === trackId ? { ...t, offlineSource: source } : t,
          ),
        }));
      },

      removeFromDownloadQueue: (trackId) => {
        set((state) => ({
          downloadQueue: state.downloadQueue.filter((t) => t.id !== trackId),
        }));
      },

      removeManyFromDownloadQueue: (trackIds) => {
        if (trackIds.length === 0) return;
        set((state) => {
          const removed = new Set(trackIds);
          const downloadProgress = { ...state.downloadProgress };
          for (const trackId of trackIds) {
            delete downloadProgress[trackId];
          }
          return {
            downloadQueue: state.downloadQueue.filter(
              (t) => !removed.has(t.id),
            ),
            downloadProgress,
          };
        });
      },

      clearDownloadQueue: () => {
        set({ downloadQueue: [] });
      },

      isTrackDownloaded: (trackId) => {
        const { downloadedTracks } = get();
        return trackId in downloadedTracks;
      },

      getDownloadedTrack: (trackId) => {
        const { downloadedTracks } = get();
        return downloadedTracks[trackId] || null;
      },

      getDownloadedTracksList: () => {
        const { downloadedTracks } = get();
        return Object.values(downloadedTracks);
      },

      getTotalDownloadSize: () => {
        const { downloadedTracks } = get();
        return Object.values(downloadedTracks).reduce(
          (total, track) => total + track.size,
          0,
        );
      },

      getDownloadedTracksCount: () => {
        const { downloadedTracks } = get();
        return Object.keys(downloadedTracks).length;
      },
    }),
    {
      name: "offlineStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        offlineModeEnabled: state.offlineModeEnabled,
        downloadedTracks: state.downloadedTracks,
        downloadedCollections: state.downloadedCollections,
        downloadQueue: state.downloadQueue,
        downloadProgress: state.downloadProgress,
        artworkCache: state.artworkCache,
        artworkCachedAt: state.artworkCachedAt,
      }),
    },
  ),
);

const useOffline = createSelectors(useOfflineBase);

export default useOffline;
