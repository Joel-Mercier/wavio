import { storage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  // Allow extra metadata without the store needing to know its shape
  // biome-ignore lint/suspicious/noExplicitAny: allow arbitrary metadata for tracks
  [key: string]: any;
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
  // Settings
  offlineModeEnabled: boolean;
  setOfflineModeEnabled: (enabled: boolean) => void;

  downloadedTracks: Record<string, OfflineTrack>;
  addDownloadedTrack: (track: OfflineTrack) => void;
  removeDownloadedTrack: (trackId: string) => void;
  clearAllDownloads: () => void;

  downloadProgress: Record<string, DownloadProgress>;
  setDownloadProgress: (trackId: string, progress: DownloadProgress) => void;
  removeDownloadProgress: (trackId: string) => void;

  downloadQueue: string[];
  addToDownloadQueue: (trackId: string) => void;
  removeFromDownloadQueue: (trackId: string) => void;
  clearDownloadQueue: () => void;

  isTrackDownloaded: (trackId: string) => boolean;
  getDownloadedTrack: (trackId: string) => OfflineTrack | null;
  getDownloadedTracksList: () => OfflineTrack[];
  getTotalDownloadSize: () => number;
  getDownloadedTracksCount: () => number;
}

const useOfflineBase = create<OfflineStore>()(
  persist(
    (set, get) => ({
      offlineModeEnabled: false,
      downloadedTracks: {},
      downloadProgress: {},
      downloadQueue: [],

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
          const { [trackId]: removed, ...remainingTracks } =
            state.downloadedTracks;
          return {
            downloadedTracks: remainingTracks,
          };
        });
      },

      clearAllDownloads: () => {
        set({
          downloadedTracks: {},
          downloadProgress: {},
          downloadQueue: [],
        });
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
          const { [trackId]: removed, ...remainingProgress } =
            state.downloadProgress;
          return {
            downloadProgress: remainingProgress,
          };
        });
      },

      addToDownloadQueue: (trackId) => {
        set((state) => {
          if (!state.downloadQueue.includes(trackId)) {
            return {
              downloadQueue: [...state.downloadQueue, trackId],
            };
          }
          return state;
        });
      },

      removeFromDownloadQueue: (trackId) => {
        set((state) => ({
          downloadQueue: state.downloadQueue.filter((id) => id !== trackId),
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
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name: string) => storage.getString(name) ?? null,
        setItem: (name: string, value: string) => storage.set(name, value),
        removeItem: (name: string) => storage.delete(name),
      })),
      partialize: (state) => ({
        offlineModeEnabled: state.offlineModeEnabled,
        downloadedTracks: state.downloadedTracks,
        downloadQueue: state.downloadQueue,
      }),
    },
  ),
);

const useOffline = createSelectors(useOfflineBase);

export default useOffline;
