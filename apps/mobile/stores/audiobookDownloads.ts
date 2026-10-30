import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";

// Downloaded audiobooks, kept apart from the music downloads in stores/offline
// so a book's dozens of files never surface as tracks and albums in the
// offline library.

export type AudiobookDownloadStatus =
  | "queued"
  | "downloading"
  | "done"
  | "failed";

export interface AudiobookDownloadedFile {
  path: string;
  size: number;
}

export interface AudiobookDownload {
  itemId: string;
  status: AudiobookDownloadStatus;
  totalFiles: number;
  totalBytes: number;
  files: Record<string, AudiobookDownloadedFile>;
  error?: string;
  updatedAt: number;
}

interface AudiobookDownloadsStore {
  downloads: Record<string, AudiobookDownload>;
  upsert: (itemId: string, patch: Partial<AudiobookDownload>) => void;
  addFile: (itemId: string, ino: string, file: AudiobookDownloadedFile) => void;
  remove: (itemId: string) => void;
  __reset: () => void;
}

const useAudiobookDownloadsBase = create<AudiobookDownloadsStore>()(
  persist(
    (set) => ({
      downloads: {},

      __reset: () => {
        set(() => ({ downloads: {} }));
      },

      upsert: (itemId, patch) => {
        set((state) => {
          const current = state.downloads[itemId] ?? {
            itemId,
            status: "queued" as const,
            totalFiles: 0,
            totalBytes: 0,
            files: {},
            updatedAt: Date.now(),
          };
          return {
            downloads: {
              ...state.downloads,
              [itemId]: { ...current, ...patch, updatedAt: Date.now() },
            },
          };
        });
      },
      addFile: (itemId, ino, file) => {
        set((state) => {
          const current = state.downloads[itemId];
          if (!current) return state;
          return {
            downloads: {
              ...state.downloads,
              [itemId]: {
                ...current,
                files: { ...current.files, [ino]: file },
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      remove: (itemId) => {
        set((state) => {
          if (!(itemId in state.downloads)) return state;
          const { [itemId]: _, ...downloads } = state.downloads;
          return { downloads };
        });
      },
    }),
    {
      name: "audiobookDownloadsStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
    },
  ),
);

export function downloadedAudiobookFile(
  itemId: string,
  ino: string,
): AudiobookDownloadedFile | null {
  return (
    useAudiobookDownloadsBase.getState().downloads[itemId]?.files[ino] ?? null
  );
}

export function isAudiobookDownloaded(itemId: string): boolean {
  return (
    useAudiobookDownloadsBase.getState().downloads[itemId]?.status === "done"
  );
}

export default useAudiobookDownloadsBase;
export { useAudiobookDownloadsBase };
