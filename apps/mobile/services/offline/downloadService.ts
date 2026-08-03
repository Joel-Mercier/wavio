import { Directory, File, Paths } from "expo-file-system";
import { offlineFileInfo } from "@/services/backend/streaming";
import { reportError } from "@/services/errorReporting";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import { useAppBase } from "@/stores/app";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import { useLibrarySyncBase } from "@/stores/librarySync";
import useOffline, {
  type DownloadProgress,
  type OfflineSource,
  type OfflineTrack,
} from "@/stores/offline";
import { logError } from "@/utils/log";
import type { Child } from "../openSubsonic/types";

// Bulk deletions loop over every downloaded track and delete files
// synchronously. On a large library that blocks the JS thread for seconds with
// no feedback, so callers get an optional progress callback and the loops yield
// to the event loop every DELETE_CHUNK tracks — letting a spinner/progress bar
// render while the work drains.
export type DeleteProgress = (done: number, total: number) => void;
export const DELETE_CHUNK = 25;
export const yieldToEventLoop = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const MAX_CONCURRENT_DOWNLOADS = 3;

// A track is retried this many times before being given up on. Connectivity
// state can't classify a failure on its own: NetInfo holds an OFFLINE_GRACE_MS
// window before committing to "offline", and downloads fail *instantly* with no
// network, so a drop produces a burst of failures while the app still believes
// it's online. Retrying rather than dequeuing means that window costs attempts,
// not tracks.
const MAX_TRACK_ATTEMPTS = 3;

// Consecutive failures (across any tracks) that trip the circuit breaker. The
// cascade itself is the signal something environmental is wrong: each failure
// re-enters processQueue, so without this the whole queue burns down at network
// speed. Draining stops and resumes on backoff or a connectivity recovery.
const FAILURE_CIRCUIT_BREAK = 3;

const QUEUE_RETRY_BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 300_000];

// How long the queue stays parked after the device reports no free space.
// Without it, a full disk fails every remaining track in seconds and the whole
// queue lands in "failed" — a state the user can only recover by re-queuing
// everything. Parking instead keeps the queue intact so it drains on its own
// once space is freed.
const STORAGE_FULL_PAUSE_MS = 30 * 60 * 1000;

// Subsonic reports API errors as HTTP 200 with a JSON/XML envelope (and a
// misconfigured reverse proxy can 200 an HTML page), so a "successful" download
// can be an error body saved under the track's name — downloadFileAsync only
// rejects on non-2xx statuses. No real audio file is this small, so only files
// under this size are sniffed for a text body before being registered.
const SUSPICIOUS_DOWNLOAD_BYTES = 8192;

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

// Thrown when an in-flight auto download finishes after extended offline mode
// was disabled: the file is discarded instead of registered. Unlike
// DownloadCancelledError it must NOT stay queued (processQueue would retry it
// in a loop against the guard), so executeDownload's failure branch handles it
// — errorReporting.isExpectedNoise matches this by name to keep it out of
// Sentry.
class AutoDownloadDiscardedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoDownloadDiscardedError";
  }
}

// A download can fail for a dozen unrelated reasons, and the native downloader
// folds them all into one "downloadFileAsync has been rejected" message — which
// used to land in Sentry as a single bucket where a bad URL was indistinguishable
// from a full disk. Name the cause so each real one gets its own Issue (and so
// the environmental ones can be told apart without parsing the message twice).
type DownloadFailureKind =
  | "disk-full"
  | "network"
  | "not-found"
  | "permission"
  | "bad-url"
  | "missing-file"
  | "server-error"
  | "unknown";

function downloadFailureKind(error: unknown): DownloadFailureKind {
  if (error && typeof error === "object" && !(error instanceof Error)) {
    const code = (error as { code?: number }).code;
    if (code === 70) return "not-found";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC|No space left on device|disk is full/i.test(message)) {
    return "disk-full";
  }
  if (
    /SocketTimeoutException|SocketException|UnknownHostException|ConnectException|Connection reset|connection abort/i.test(
      message,
    )
  ) {
    return "network";
  }
  if (/permission/i.test(message)) return "permission";
  if (/URI is not absolute|Unsupported URI|Invalid URL/i.test(message)) {
    return "bad-url";
  }
  if (/FileNotFoundException|file does not exist/i.test(message)) {
    return "missing-file";
  }
  if (/server returned an error response/i.test(message)) return "server-error";
  return "unknown";
}

export class OfflineDownloadService {
  private static instance: OfflineDownloadService;
  private activeIds: Set<string> = new Set();
  private resolvers: Map<string, Resolvers> = new Map();
  // Bumped by clearAllDownloads so in-flight downloads from before the clear
  // discard their result instead of re-registering into the wiped store.
  private generation = 0;
  // Failed attempts per queued track, so a track is retried across transient
  // failures instead of being dropped on the first one. Cleared on success.
  private attempts: Map<string, number> = new Map();
  private consecutiveFailures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Set when a download failed for lack of storage; the queue stays parked
  // until then instead of failing every remaining track against a full disk.
  private storageFullUntil = 0;

  private constructor() {
    subscribeConnectionType((type) => {
      if (type === "wifi") this.resumeAfterFailures();
    });
    // Connectivity alone isn't enough: a cellular→offline→cellular round trip
    // never reports type "wifi", and a server that stops answering while the
    // device stays online doesn't change the connection type at all. Both leave
    // a queue that only the effective-online signal can restart.
    subscribeEffectiveOnline(() => {
      if (getIsEffectivelyOnline()) this.resumeAfterFailures();
    });
  }

  // Connectivity came back: the reason the breaker tripped is gone, so drop the
  // backoff and drain now rather than making the user wait out a timer that was
  // sized for an unknown fault.
  private resumeAfterFailures(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.consecutiveFailures = 0;
    this.processQueue();
  }

  // The storage park has no other wake-up: freeing space changes no signal the
  // service listens to, and every drain kicked from executeDownload's finally
  // just re-parks. Without this timer the queue stays paused until the app
  // restarts (or the user happens to switch networks).
  private scheduleStorageRetry(): void {
    if (this.retryTimer) return;
    const delay = Math.max(0, this.storageFullUntil - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.storageFullUntil = 0;
      // The park *was* the backoff, so a disk-full cascade shouldn't also
      // escalate the circuit breaker's next delay.
      this.consecutiveFailures = 0;
      this.processQueue();
    }, delay);
  }

  private scheduleQueueRetry(): void {
    if (this.retryTimer) return;
    const step = Math.min(
      this.consecutiveFailures - FAILURE_CIRCUIT_BREAK,
      QUEUE_RETRY_BACKOFF_STEPS_MS.length - 1,
    );
    const delay = QUEUE_RETRY_BACKOFF_STEPS_MS[Math.max(0, step)];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.processQueue();
    }, delay);
  }

  static getInstance(): OfflineDownloadService {
    if (!OfflineDownloadService.instance) {
      OfflineDownloadService.instance = new OfflineDownloadService();
    }
    return OfflineDownloadService.instance;
  }

  async downloadTrack(
    track: Child,
    opts?: { source?: OfflineSource },
  ): Promise<void> {
    const offlineStore = useOffline.getState();
    const source = opts?.source ?? "user";

    if (offlineStore.isTrackDownloaded(track.id)) {
      // An explicit save of a track the library sync already cached promotes it
      // to user-owned so it survives disabling extended offline mode.
      const downloaded = offlineStore.getDownloadedTrack(track.id);
      if (source === "user" && downloaded?.source === "auto") {
        offlineStore.addDownloadedTrack({ ...downloaded, source: "user" });
      }
      return;
    }

    const existing = this.resolvers.get(track.id);
    if (existing) {
      if (source === "user") {
        offlineStore.setQueuedTrackSource(track.id, "user");
      }
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

    offlineStore.addToDownloadQueue({ ...track, offlineSource: source });
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

  // Bulk enqueue for the library sync: one store write for the queue and one
  // for progress instead of two per track — at a 200-song page each write
  // re-serializes the whole persisted store. Fire-and-forget (no per-track
  // resolvers); failures land in downloadProgress like any other download.
  enqueueTracks(tracks: Child[], source: OfflineSource): void {
    const offlineStore = useOffline.getState();
    const queuedIds = new Set(offlineStore.downloadQueue.map((t) => t.id));
    const toQueue = tracks.filter(
      (track) =>
        !offlineStore.isTrackDownloaded(track.id) && !queuedIds.has(track.id),
    );
    if (toQueue.length > 0) {
      offlineStore.addManyToDownloadQueue(
        toQueue.map((track) => ({ ...track, offlineSource: source })),
      );
      offlineStore.setManyDownloadProgress(
        toQueue.map((track) => ({
          trackId: track.id,
          status: "pending" as const,
          progress: 0,
        })),
      );
    }
    this.processQueue();
  }

  // Drops queued auto downloads — all of them when extended offline mode is
  // disabled, or only `onlyIds` when the library sync reconciles server-side
  // deletions. Tracks already in flight are left to finish (they can't be
  // cancelled) — their queue entry still carries source "auto", so a later
  // disable or resync sweeps them.
  removeQueuedAutoDownloads(onlyIds?: ReadonlySet<string>): void {
    const offlineStore = useOffline.getState();
    const removedIds = offlineStore.downloadQueue
      .filter(
        (queued) =>
          queued.offlineSource === "auto" &&
          !this.activeIds.has(queued.id) &&
          (!onlyIds || onlyIds.has(queued.id)),
      )
      .map((queued) => queued.id);
    offlineStore.removeManyFromDownloadQueue(removedIds);
    for (const trackId of removedIds) {
      this.attempts.delete(trackId);
      const resolvers = this.resolvers.get(trackId);
      this.resolvers.delete(trackId);
      resolvers?.reject(
        new DownloadCancelledError("Extended offline mode disabled"),
      );
    }
  }

  // Drains the queue persisted by a previous session and reconciles stale
  // progress. Must be called *after* the offline store has rehydrated (the
  // store is scoped and uses skipHydration), so the app layout drives it on
  // every scope hydration — a constructor call would run at module-eval time
  // against an empty queue and leave interrupted downloads stranded.
  resume(): void {
    const offlineStore = useOffline.getState();
    // Fresh session or incoming scope: don't inherit the previous queue's
    // failure history, and never start out tripped.
    this.attempts.clear();
    this.consecutiveFailures = 0;
    this.storageFullUntil = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

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

    // Offline (no network, or the server stopped answering): leave the queue
    // untouched. Draining it now would fail every item against a dead network
    // in seconds, and executeDownload's permanent-failure branch would dequeue
    // the lot. subscribeEffectiveOnline above restarts it on recovery.
    if (!getIsEffectivelyOnline()) return;

    // The circuit breaker owns the next attempt — it must not be stepped around
    // by a drain kicked from executeDownload's finally.
    if (this.retryTimer) return;

    if (downloadsWifiOnly && getConnectionType() !== "wifi") {
      this.pauseQueued();
      return;
    }

    // The device had no space left on the last attempt. Nothing will change by
    // trying again right away, so hold the queue (paused, not failed) until the
    // window elapses.
    if (Date.now() < this.storageFullUntil) {
      this.pauseQueued();
      this.scheduleStorageRetry();
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

  // Marks every queued item the drain isn't currently working on as paused, so
  // the UI reflects "waiting on something" rather than a stalled download.
  private pauseQueued(): void {
    const offlineStore = useOffline.getState();
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
  }

  private async executeDownload(track: Child): Promise<void> {
    const offlineStore = useOffline.getState();
    const resolvers = this.resolvers.get(track.id);
    const generation = this.generation;
    const storageParkAtStart = this.storageFullUntil;

    try {
      await this.writeTrackToDisk(track, generation);
      offlineStore.removeFromDownloadQueue(track.id);
      this.attempts.delete(track.id);
      this.consecutiveFailures = 0;
      // A file landed, so there is space again — unless one of the downloads
      // running alongside this one hit ENOSPC while it wrote. This one started
      // before that park, so a small file squeezing onto an almost-full disk
      // says nothing about the disk *now*: leave the park standing rather than
      // draining the rest of the queue into it.
      if (this.storageFullUntil === storageParkAtStart) {
        this.storageFullUntil = 0;
      }
      resolvers?.resolve();
    } catch (error) {
      const attempts = (this.attempts.get(track.id) ?? 0) + 1;
      this.attempts.set(track.id, attempts);
      this.consecutiveFailures++;
      const kind = downloadFailureKind(error);
      // A full device says nothing about *this* track and won't empty itself
      // between attempts — retrying would burn the track's attempts and then
      // every other queued track's, turning the whole queue into failures the
      // user has to re-queue by hand. Refund the attempt and park the queue
      // (processQueue) so it resumes on its own once there's space.
      if (kind === "disk-full") {
        this.attempts.set(track.id, attempts - 1);
        this.storageFullUntil = Date.now() + STORAGE_FULL_PAUSE_MS;
      }
      const retryable =
        kind === "disk-full" ||
        error instanceof DownloadCancelledError ||
        !getIsEffectivelyOnline() ||
        attempts < MAX_TRACK_ATTEMPTS;
      if (retryable) {
        // Logged out / switched servers, connectivity dropped under it, the
        // device ran out of space, or a failure we haven't yet seen enough of to
        // call permanent. Keep the item
        // queued so it resumes (next login, connectivity recovery, or backoff),
        // reflect that it's waiting, and don't report it. Dequeuing here is what
        // let a 2.5s connectivity blip burn down the whole queue: every failure
        // re-enters processQueue, and with no network they fail instantly.
        offlineStore.setDownloadProgress(track.id, {
          trackId: track.id,
          status: "pending",
          progress: 0,
        });
      } else if (generation === this.generation) {
        offlineStore.removeFromDownloadQueue(track.id);
        this.attempts.delete(track.id);
        offlineStore.setDownloadProgress(track.id, {
          trackId: track.id,
          status: "failed",
          progress: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // `endpoint` is the failure cause, not a URL: it's what reportError
        // fingerprints on, so a bad stream URL, a missing offline directory and
        // a denied permission each get their own Issue instead of sharing one
        // opaque "downloadFileAsync rejected" bucket. Environmental causes
        // (disk-full, sockets, a track the server no longer has) are dropped by
        // the classifier — isNativeEnvironmentFailure / notFoundIsExpected.
        reportError(error, {
          area: "storage",
          endpoint: `download:${kind}`,
          status:
            kind === "not-found"
              ? ((error as { code?: number })?.code ?? undefined)
              : undefined,
          notFoundIsExpected: true,
          extra: { trackId: track.id, attempts, kind },
        });
      }
      resolvers?.reject(error);
    } finally {
      this.activeIds.delete(track.id);
      this.resolvers.delete(track.id);
      if (this.consecutiveFailures >= FAILURE_CIRCUIT_BREAK) {
        this.scheduleQueueRetry();
      } else {
        this.processQueue();
      }
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

    const { url, suffix } = offlineFileInfo(track);
    const fileName = `${track.id}.${suffix}`;
    const filePath = new File(offlineDir, fileName);

    const downloadResult = await File.downloadFileAsync(url, filePath, {
      idempotent: true,
    });

    if (!downloadResult.exists) {
      throw new Error("Download failed - file does not exist");
    }

    if ((downloadResult.size ?? 0) < SUSPICIOUS_DOWNLOAD_BYTES) {
      const head = (await downloadResult.text()).trimStart();
      if (head.startsWith("{") || head.startsWith("<")) {
        try {
          downloadResult.delete();
        } catch {}
        throw new Error("Download failed - server returned an error response");
      }
    }

    if (generation !== this.generation) {
      try {
        downloadResult.delete();
      } catch {}
      throw new Error("Downloads cleared");
    }

    // Re-read the queue entry: a user save can promote an in-flight auto
    // download (setQueuedTrackSource), which replaces the queued object this
    // method holds a stale reference to.
    const source =
      offlineStore.downloadQueue.find((t) => t.id === track.id)
        ?.offlineSource ?? "user";

    // Extended offline mode was disabled while this auto download was in
    // flight (removeQueuedAutoDownloads can't cancel active ids): registering
    // it now would orphan a file the disable sweep already ran past.
    if (
      source === "auto" &&
      !useLibrarySyncBase.getState().extendedOfflineModeEnabled
    ) {
      try {
        downloadResult.delete();
      } catch {}
      throw new AutoDownloadDiscardedError("Extended offline mode disabled");
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
      source,
      track: track.track,
      discNumber: track.discNumber,
      albumArtist: track.displayAlbumArtist,
      year: track.year,
      genre: track.genre?.trim() || track.genres?.[0]?.name,
      sortName: track.sortName,
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
    const referencedElsewhere = trackIdsReferencedByCollections(
      Object.values(offlineStore.downloadedCollections).filter(
        (collection) => collection.id !== collectionId,
      ),
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
  async clearAllDownloads(onProgress?: DeleteProgress): Promise<void> {
    const offlineStore = useOffline.getState();
    const tracks = offlineStore.getDownloadedTracksList();
    const { serverId, username } = useAuthBase.getState();
    // No signed-in scope means no directory to clear; guard on the scope's
    // identity fields rather than letting currentAuthScope() return a degenerate
    // "_" bucket and deleting the wrong directory.
    const scope = serverId && username ? currentAuthScope() : null;

    try {
      const total = tracks.length;
      onProgress?.(0, total);
      let done = 0;
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
        done++;
        if (done % DELETE_CHUNK === 0) {
          onProgress?.(done, total);
          await yieldToEventLoop();
        }
      }
      onProgress?.(total, total);

      if (scope) {
        const scopedDir = new Directory(Paths.document, "offline", scope);
        if (scopedDir.exists) scopedDir.delete();
      }

      this.generation++;
      this.activeIds.clear();
      this.attempts.clear();
      this.consecutiveFailures = 0;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
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

  // Makes every download currently writing to disk throw away its file instead
  // of registering it. Used by the canonical-id migration, whose in-flight
  // downloads carry ids the server has renumbered: registering one would leave
  // an orphan entry under an id no collection references. The queue entries
  // themselves are left alone, so the drain retries them once remapped.
  discardInFlightDownloads(): void {
    if (this.activeIds.size === 0) return;
    this.generation++;
    this.attempts.clear();
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
