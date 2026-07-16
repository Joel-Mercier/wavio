import { Directory, File, Paths } from "expo-file-system";
import { downloadUrl } from "@/services/backend/streaming";
import { getConnectionType, subscribeConnectionType } from "@/services/network";
import { useAppBase } from "@/stores/app";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useOffline, {
  type DownloadProgress,
  type OfflineTrack,
} from "@/stores/offline";
import { logError } from "@/utils/log";
import type { Child } from "../openSubsonic/types";

const MAX_CONCURRENT_DOWNLOADS = 3;

type Resolvers = { resolve: () => void; reject: (err: unknown) => void };

// Thrown when a download can't proceed because there's no active server — the
// user logged out or switched servers mid-download. A self-inflicted
// cancellation, not a bug: the item stays queued to resume on the next login and
// is kept out of Sentry (errorReporting.isExpectedNoise matches this by name).
class DownloadCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadCancelledError";
  }
}

export class OfflineDownloadService {
  private static instance: OfflineDownloadService;
  private activeIds: Set<string> = new Set();
  private resolvers: Map<string, Resolvers> = new Map();
  // Bumped by clearAllDownloads so in-flight downloads from before the clear
  // discard their result instead of re-registering into the wiped store.
  private generation = 0;

  private constructor() {
    // Drain any persisted queue from a previous session and reconcile stale state.
    queueMicrotask(() => this.resume());
    subscribeConnectionType((type) => {
      if (type === "wifi") this.processQueue();
    });
  }

  static getInstance(): OfflineDownloadService {
    if (!OfflineDownloadService.instance) {
      OfflineDownloadService.instance = new OfflineDownloadService();
    }
    return OfflineDownloadService.instance;
  }

  async downloadTrack(track: Child): Promise<void> {
    const offlineStore = useOffline.getState();

    if (offlineStore.isTrackDownloaded(track.id)) return;

    const existing = this.resolvers.get(track.id);
    if (existing) {
      return new Promise<void>((resolve, reject) => {
        const original = this.resolvers.get(track.id);
        if (!original) {
          resolve();
          return;
        }
        this.resolvers.set(track.id, {
          resolve: () => {
            original.resolve();
            resolve();
          },
          reject: (err) => {
            original.reject(err);
            reject(err);
          },
        });
      });
    }

    offlineStore.addToDownloadQueue(track);
    offlineStore.setDownloadProgress(track.id, {
      trackId: track.id,
      status: "pending",
      progress: 0,
    });

    const promise = new Promise<void>((resolve, reject) => {
      this.resolvers.set(track.id, { resolve, reject });
    });

    this.processQueue();
    return promise;
  }

  async downloadTracks(tracks: Child[]): Promise<void> {
    await Promise.all(tracks.map((track) => this.downloadTrack(track)));
  }

  async downloadAllStarredTracks(starredTracks: Child[]): Promise<void> {
    await this.downloadTracks(starredTracks);
  }

  resume(): void {
    const offlineStore = useOffline.getState();

    for (const track of offlineStore.getDownloadedTracksList()) {
      if (track.size > 0) continue;
      try {
        const file = new File(track.path);
        if (file.exists && file.size > 0) {
          offlineStore.addDownloadedTrack({ ...track, size: file.size });
        }
      } catch (error) {
        logError(
          `Download Manager: Error backfilling size for ${track.id}:`,
          error,
        );
      }
    }

    // Any progress entry stuck in "downloading" or "pending" from a killed
    // session is stale: nothing is actually downloading it. Mark as failed
    // unless the track is still in the queue (in which case we'll resume it).
    const queuedIds = new Set(offlineStore.downloadQueue.map((t) => t.id));
    for (const [id, progress] of Object.entries(
      offlineStore.downloadProgress,
    )) {
      if (
        (progress.status === "downloading" || progress.status === "pending") &&
        !queuedIds.has(id)
      ) {
        offlineStore.setDownloadProgress(id, {
          trackId: id,
          status: "failed",
          progress: 0,
          error: "Interrupted",
        });
      }
    }

    this.processQueue();
  }

  private processQueue(): void {
    const offlineStore = useOffline.getState();
    const { downloadsWifiOnly } = useAppBase.getState();

    // No active server (logged out / mid server-switch): don't drain the queue.
    // Leave items pending so they resume after the next login, and avoid a
    // busy-retry loop that would otherwise throw per item against no server.
    const { url: authUrl, username } = useAuthBase.getState();
    if (!authUrl || !username) return;

    if (downloadsWifiOnly && getConnectionType() !== "wifi") {
      for (const track of offlineStore.downloadQueue) {
        if (this.activeIds.has(track.id)) continue;
        const progress = offlineStore.downloadProgress[track.id];
        if (progress?.status !== "paused") {
          offlineStore.setDownloadProgress(track.id, {
            trackId: track.id,
            status: "paused",
            progress: progress?.progress ?? 0,
          });
        }
      }
      return;
    }

    while (this.activeIds.size < MAX_CONCURRENT_DOWNLOADS) {
      const next = offlineStore.downloadQueue.find(
        (t) => !this.activeIds.has(t.id),
      );
      if (!next) return;
      this.activeIds.add(next.id);
      void this.executeDownload(next);
    }
  }

  private async executeDownload(track: Child): Promise<void> {
    const offlineStore = useOffline.getState();
    const resolvers = this.resolvers.get(track.id);
    const generation = this.generation;

    try {
      await this.writeTrackToDisk(track, generation);
      offlineStore.removeFromDownloadQueue(track.id);
      resolvers?.resolve();
    } catch (error) {
      if (error instanceof DownloadCancelledError) {
        // Logged out / switched servers mid-download. Keep the item queued (it
        // resumes on next login), reflect that it's waiting, and don't report it.
        offlineStore.setDownloadProgress(track.id, {
          trackId: track.id,
          status: "pending",
          progress: 0,
        });
      } else if (generation === this.generation) {
        offlineStore.removeFromDownloadQueue(track.id);
        offlineStore.setDownloadProgress(track.id, {
          trackId: track.id,
          status: "failed",
          progress: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        logError(
          `Download Manager: Error downloading track ${track.id}:`,
          error,
        );
      }
      resolvers?.reject(error);
    } finally {
      this.activeIds.delete(track.id);
      this.resolvers.delete(track.id);
      this.processQueue();
    }
  }

  private async writeTrackToDisk(
    track: Child,
    generation: number,
  ): Promise<void> {
    const offlineStore = useOffline.getState();

    offlineStore.setDownloadProgress(track.id, {
      trackId: track.id,
      status: "downloading",
      progress: 0,
    });

    const { url: authUrl, username } = useAuthBase.getState();
    if (!authUrl || !username) {
      throw new DownloadCancelledError("No active server");
    }
    const scope = currentAuthScope();
    // Files live under per-scope subdirectories so the same track id on two
    // different servers doesn't overwrite a single shared file.
    const offlineDir = new Directory(Paths.document, "offline", scope);
    offlineDir.create({ idempotent: true, intermediates: true });

    const url = downloadUrl(track.id);
    const fileName = `${track.id}.${track.suffix || "mp3"}`;
    const filePath = new File(offlineDir, fileName);

    const downloadResult = await File.downloadFileAsync(url, filePath, {
      idempotent: true,
    });

    if (!downloadResult.exists) {
      throw new Error("Download failed - file does not exist");
    }

    if (generation !== this.generation) {
      try {
        downloadResult.delete();
      } catch {}
      throw new Error("Downloads cleared");
    }

    const offlineTrack: OfflineTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration || 0,
      coverArt: track.coverArt,
      path: downloadResult.uri,
      size: downloadResult.size || track.size || 0,
      downloadedAt: new Date().toISOString(),
    };

    offlineStore.addDownloadedTrack(offlineTrack);
    offlineStore.setDownloadProgress(track.id, {
      trackId: track.id,
      status: "completed",
      progress: 100,
    });
  }

  removeDownloadedTrack(trackId: string): void {
    const offlineStore = useOffline.getState();
    const track = offlineStore.getDownloadedTrack(trackId);
    if (!track) return;

    try {
      const file = new File(track.path);
      if (file.exists) {
        file.delete();
      }
      offlineStore.removeDownloadedTrack(trackId);
      offlineStore.removeDownloadProgress(trackId);
    } catch (error) {
      logError(`Error removing track ${trackId}:`, error);
      throw error;
    }
  }

  // Removes a saved collection (playlist/album) and its tracks, but keeps any
  // track still referenced by another saved collection so removing one playlist
  // doesn't delete songs shared with another.
  removeCollection(collectionId: string, trackIds: string[]): void {
    const offlineStore = useOffline.getState();
    const referencedElsewhere = new Set(
      Object.values(offlineStore.downloadedCollections)
        .filter((collection) => collection.id !== collectionId)
        .flatMap((collection) => collection.trackIds),
    );

    for (const trackId of trackIds) {
      if (referencedElsewhere.has(trackId)) continue;
      try {
        this.removeDownloadedTrack(trackId);
      } catch (error) {
        logError(
          `Download Manager: Error removing track ${trackId} for collection ${collectionId}:`,
          error,
        );
      }
    }

    offlineStore.removeDownloadedCollection(collectionId);
  }

  // Clears downloads for the currently active server only. The offline store
  // is scoped per (server, user), so this only touches the current scope's
  // state — but we also need to wipe the per-scope file directory.
  clearAllDownloads(): void {
    const offlineStore = useOffline.getState();
    const tracks = offlineStore.getDownloadedTracksList();
    const { serverId, username } = useAuthBase.getState();
    // No signed-in scope means no directory to clear; guard on the scope's
    // identity fields rather than letting currentAuthScope() return a degenerate
    // "_" bucket and deleting the wrong directory.
    const scope = serverId && username ? currentAuthScope() : null;

    try {
      for (const track of tracks) {
        try {
          const file = new File(track.path);
          if (file.exists) {
            file.delete();
          }
        } catch (error) {
          logError(
            `Download Manager: Error deleting file for track ${track.id}:`,
            error,
          );
        }
      }

      if (scope) {
        const scopedDir = new Directory(Paths.document, "offline", scope);
        if (scopedDir.exists) scopedDir.delete();
      }

      this.generation++;
      this.activeIds.clear();
      for (const { reject } of this.resolvers.values()) {
        reject(new Error("Downloads cleared"));
      }
      this.resolvers.clear();
      offlineStore.clearAllDownloads();
    } catch (error) {
      logError("Download Manager: Error clearing downloads:", error);
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
}

export const offlineDownloadService = OfflineDownloadService.getInstance();
