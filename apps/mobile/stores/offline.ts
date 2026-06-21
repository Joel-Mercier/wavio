import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import type { Child } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

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
  year?: number;
  savedAt: string;
};

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
  removeDownloadedTrack: (trackId: string) => void;
  clearAllDownloads: () => void;

  downloadedCollections: Record<string, OfflineCollection>;
  addDownloadedCollection: (collection: OfflineCollection) => void;
  removeDownloadedCollection: (collectionId: string) => void;
  getDownloadedCollections: () => OfflineCollection[];

  downloadProgress: Record<string, DownloadProgress>;
  setDownloadProgress: (trackId: string, progress: DownloadProgress) => void;
  removeDownloadProgress: (trackId: string) => void;
  clearFailedDownloads: () => void;

  downloadQueue: Child[];
  addToDownloadQueue: (track: Child) => void;
  removeFromDownloadQueue: (trackId: string) => void;
  clearDownloadQueue: () => void;

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
  downloadQueue: [] as Child[],
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
        });
      },

      addDownloadedCollection: (collection) => {
        set((state) => ({
          downloadedCollections: {
            ...state.downloadedCollections,
            [collection.id]: collection,
          },
        }));
      },

      removeDownloadedCollection: (collectionId) => {
        set((state) => {
          const { [collectionId]: _removed, ...remaining } =
            state.downloadedCollections;
          return { downloadedCollections: remaining };
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

      removeFromDownloadQueue: (trackId) => {
        set((state) => ({
          downloadQueue: state.downloadQueue.filter((t) => t.id !== trackId),
        }));
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
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
      partialize: (state) => ({
        offlineModeEnabled: state.offlineModeEnabled,
        downloadedTracks: state.downloadedTracks,
        downloadedCollections: state.downloadedCollections,
        downloadQueue: state.downloadQueue,
        downloadProgress: state.downloadProgress,
      }),
    },
  ),
);

const useOffline = createSelectors(useOfflineBase);

export default useOffline;
