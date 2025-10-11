import useOffline, { type DownloadProgress, type OfflineTrack } from "@/stores/offline";
import { downloadUrl } from "@/utils/streaming";
import { Directory, File, Paths } from "expo-file-system";
import type { Child } from "./openSubsonic/types";

export class OfflineDownloadService {
  private static instance: OfflineDownloadService;
  private downloadQueue: Set<string> = new Set();
  private isProcessing = false;

  private constructor() { }

  static getInstance(): OfflineDownloadService {
    if (!OfflineDownloadService.instance) {
      OfflineDownloadService.instance = new OfflineDownloadService();
    }
    return OfflineDownloadService.instance;
  }

  async downloadTrack(track: Child): Promise<void> {
    const trackId = track.id;
    const offlineStore = useOffline.getState();

    if (offlineStore.isTrackDownloaded(trackId)) {
      console.log(`Download Manager: Track ${trackId} is already downloaded`);
      return;
    }

    try {
      await this.downloadSingleTrackWithData(track);
    } catch (error) {
      console.error(`Download Manager: Failed to download track ${trackId}:`, error);
      throw error;
    }
  }

  async downloadTracks(tracks: Child[]): Promise<void> {
    for (const track of tracks) {
      await this.downloadTrack(track);
    }
  }

  async downloadAllStarredTracks(starredTracks: Child[]): Promise<void> {
    console.log(`Download Manager: Starting download of ${starredTracks.length} starred tracks`);
    await this.downloadTracks(starredTracks);
  }

  private async processDownloadQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const offlineStore = useOffline.getState();

    while (this.downloadQueue.size > 0) {
      const trackId = this.downloadQueue.values().next().value;
      if (!trackId) break;
      this.downloadQueue.delete(trackId);

      try {
        await this.downloadSingleTrack(trackId);
        offlineStore.removeFromDownloadQueue(trackId);
      } catch (error) {
        console.error(`Download Manager: Failed to download track ${trackId}:`, error);
        offlineStore.setDownloadProgress(trackId, {
          trackId,
          status: "failed",
          progress: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        offlineStore.removeFromDownloadQueue(trackId);
      }
    }

    this.isProcessing = false;
  }

  private async downloadSingleTrackWithData(track: Child): Promise<void> {
    const trackId = track.id;
    const offlineStore = useOffline.getState();

    offlineStore.setDownloadProgress(trackId, {
      trackId,
      status: "downloading",
      progress: 0,
    });

    try {
      const offlineDir = new Directory(Paths.document, "offline");
      offlineDir.create({ idempotent: true, intermediates: true });

      const url = downloadUrl(trackId);
      const fileName = `${trackId}.${track.suffix || "mp3"}`;
      const filePath = new File(offlineDir, fileName);

      offlineStore.setDownloadProgress(trackId, {
        trackId,
        status: "downloading",
        progress: 25,
      });

      const downloadResult = await File.downloadFileAsync(
        url,
        filePath,
        {
          idempotent: true,
        },
        // (downloadProgress) => {
        //   const progress =
        //     Math.round(
        //       (downloadProgress.totalBytesWritten /
        //         downloadProgress.totalBytesExpectedToWrite) *
        //         75,
        //     ) + 25;
        //   offlineStore.setDownloadProgress(trackId, {
        //     trackId,
        //     status: "downloading",
        //     progress: Math.min(progress, 100),
        //   });
        // },
      );

      if (downloadResult.exists) {
        offlineStore.setDownloadProgress(trackId, {
          trackId,
          status: "downloading",
          progress: 90,
        });

        const offlineTrack: OfflineTrack = {
          id: trackId,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration || 0,
          coverArt: track.coverArt,
          path: downloadResult.uri,
          size: track.size || 0,
          downloadedAt: new Date().toISOString(),
        };

        offlineStore.addDownloadedTrack(offlineTrack);

        offlineStore.setDownloadProgress(trackId, {
          trackId,
          status: "completed",
          progress: 100,
        });

        console.log(`Download Manager: Successfully downloaded track ${trackId}`);
      } else {
        throw new Error("Download Manager: Download failed - file does not exist");
      }
    } catch (error) {
      console.error(`Download Manager: Error downloading track ${trackId}:`, error);
      offlineStore.setDownloadProgress(trackId, {
        trackId,
        status: "failed",
        progress: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async downloadSingleTrack(trackId: string): Promise<void> {
    const offlineStore = useOffline.getState();

    offlineStore.setDownloadProgress(trackId, {
      trackId,
      status: "downloading",
      progress: 0,
    });

    try {
      const track = await this.getTrackInfo(trackId);
      if (!track) {
        throw new Error("Download Manager: Track not found");
      }

      const offlineDir = new Directory(Paths.document, "offline");
      offlineDir.create({ idempotent: true, intermediates: true });

      const url = downloadUrl(trackId);
      const fileName = `${trackId}.${track.suffix || "mp3"}`;
      const filePath = new File(offlineDir, fileName);

      offlineStore.setDownloadProgress(trackId, {
        trackId,
        status: "downloading",
        progress: 25,
      });

      const downloadResult = await File.downloadFileAsync(
        url,
        filePath,
        {
          idempotent: true,
        },
        // (downloadProgress) => {
        //   const progress =
        //     Math.round(
        //       (downloadProgress.totalBytesWritten /
        //         downloadProgress.totalBytesExpectedToWrite) *
        //         75,
        //     ) + 25;
        //   offlineStore.setDownloadProgress(trackId, {
        //     trackId,
        //     status: "downloading",
        //     progress: Math.min(progress, 100),
        //   });
        // },
      );

      if (downloadResult.exists) {
        offlineStore.setDownloadProgress(trackId, {
          trackId,
          status: "downloading",
          progress: 90,
        });

        const offlineTrack = {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration || 0,
          coverArt: track.coverArt,
          path: downloadResult.uri,
          size: track.size || 0,
          downloadedAt: new Date().toISOString(),
        };

        offlineStore.addDownloadedTrack(offlineTrack);

        offlineStore.setDownloadProgress(trackId, {
          trackId,
          status: "completed",
          progress: 100,
        });

        console.log(`Download Manager: Successfully downloaded track ${trackId}`);
      } else {
        throw new Error("Download Manager: Download failed - file does not exist");
      }
    } catch (error) {
      console.error(`Download Manager: Error downloading track ${trackId}:`, error);
      offlineStore.setDownloadProgress(trackId, {
        trackId,
        status: "failed",
        progress: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async getTrackInfo(trackId: string): Promise<Child | null> {
    console.warn(
      "getTrackInfo not implemented - track data should be passed directly",
    );
    return null;
  }

  removeDownloadedTrack(trackId: string): void {
    const offlineStore = useOffline.getState();
    const track = offlineStore.getDownloadedTrack(trackId);

    if (track) {
      try {
        const file = new File(track.path);
        if (file.exists) {
          file.delete();
        }

        offlineStore.removeDownloadedTrack(trackId);
        offlineStore.removeDownloadProgress(trackId);

        console.log(`Download Manager: Successfully removed downloaded track ${trackId}`);
      } catch (error) {
        console.error(`Error removing track ${trackId}:`, error);
        throw error;
      }
    }
  }

  clearAllDownloads(): void {
    const offlineStore = useOffline.getState();
    const tracks = offlineStore.getDownloadedTracksList();

    try {
      for (const track of tracks) {
        try {
          const file = new File(track.path);
          if (file.exists) {
            file.delete();
          }
        } catch (error) {
          console.error(`Download Manager: Error deleting file for track ${track.id}:`, error);
        }
      }

      const offlineDir = new Directory(Paths.document, "offline");
      if (offlineDir.exists) {
        offlineDir.delete();
      }

      offlineStore.clearAllDownloads();

      console.log("Download Manager: Successfully cleared all downloads");
    } catch (error) {
      console.error("Download Manager: Error clearing downloads:", error);
      throw error;
    }
  }

  getDownloadProgress(trackId: string): DownloadProgress | null {
    const offlineStore = useOffline.getState();
    return offlineStore.downloadProgress[trackId] || null;
  }

  isTrackDownloading(trackId: string): boolean {
    const progress = this.getDownloadProgress(trackId);
    return progress?.status === "downloading" || progress?.status === "pending";
  }

  pauseAllDownloads(): void {
    this.downloadQueue.clear();
    const offlineStore = useOffline.getState();
    offlineStore.clearDownloadQueue();
    this.isProcessing = false;
  }
}

export const offlineDownloadService = OfflineDownloadService.getInstance();
