import { Directory, File, Paths } from "expo-file-system";
import { offlineFileInfo } from "@/services/backend/streaming";
import { isTlsTrustFailure, reportError } from "@/services/errorReporting";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  artworkCacheService,
  cacheArtworkForTracks,
} from "@/services/offline/artworkCacheService";
import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import {
  externalRootUri,
  forgetCachedDirectory,
  internalArtworkDirectory,
  internalScopedDirectory,
  isExternalDownloadLocation,
  pruneEmptyAlbumFolders,
  resolveTargetDirectory,
} from "@/services/offline/downloadDestination";
import { albumSegments, exportFileName } from "@/services/offline/fileNaming";
import { requestHeadersForUrl } from "@/services/serverHeaders";
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

// How long the queue stays parked after a download fails the TLS handshake.
// Same reasoning as the storage park, and the same stakes: every track comes
// from the host whose certificate was rejected, so retrying dumps the whole
// queue into "failed" for the user to re-queue by hand. The real fix (trusting
// the certificate again) re-enters through login, whose scope change calls
// resume() and lifts the park — this window is only the fallback.
const TLS_UNTRUSTED_PAUSE_MS = 30 * 60 * 1000;

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
  | "tls"
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
  // Before the generic socket test below: a rejected handshake is not transient
  // connectivity, it's a certificate the device won't trust. Only a fresh sign-in
  // can re-trust it, so it gets its own kind, message and queue park.
  if (isTlsTrustFailure(error)) return "tls";
  // Kept in lockstep with NATIVE_ENVIRONMENT_RE in services/errorReporting.ts.
  // An HTTP/2 `StreamResetException: stream was reset` is the same connectivity
  // class as a reset connection, phrased differently by okhttp.
  if (
    /SocketTimeoutException|SocketException|UnknownHostException|ConnectException|StreamResetException|stream was reset|Connection reset|connection abort/i.test(
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
  // Same, for a server certificate the device won't trust.
  private tlsBlockedUntil = 0;

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

  private parkedUntil(): number {
    return Math.max(this.storageFullUntil, this.tlsBlockedUntil);
  }

  // A park has no other wake-up: freeing space or trusting a certificate changes
  // no signal the service listens to, and every drain kicked from
  // executeDownload's finally just re-parks. Without this timer the queue stays
  // paused until the app restarts (or the user happens to switch networks).
  private scheduleParkRetry(): void {
    if (this.retryTimer) return;
    const delay = Math.max(0, this.parkedUntil() - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.storageFullUntil = 0;
      this.tlsBlockedUntil = 0;
      // The park *was* the backoff, so the cascade that caused it shouldn't
      // also escalate the circuit breaker's next delay.
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

    // Ahead of every early return below: a track already on disk from an
    // earlier save may still be missing its cover, and a saved track without
    // one is a fallback icon in the player and on the lock screen offline.
    cacheArtworkForTracks([track]);

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
    // Batched ahead of the per-track calls so the alias table is written once
    // rather than once per song; the per-track calls then find nothing new.
    cacheArtworkForTracks(tracks);
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
    this.tlsBlockedUntil = 0;
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

    // The device had no space left on the last attempt, or the server's
    // certificate was rejected. Nothing will change by trying again right away,
    // so hold the queue (paused, not failed) until the window elapses.
    if (Date.now() < this.parkedUntil()) {
      this.pauseQueued();
      this.scheduleParkRetry();
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
    const tlsParkAtStart = this.tlsBlockedUntil;

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
      // A completed handshake is proof the certificate is trusted again, under
      // the same caveat: a park set while this one was in flight stands.
      if (this.tlsBlockedUntil === tlsParkAtStart) {
        this.tlsBlockedUntil = 0;
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
      // An untrusted certificate isn't this track's fault either: it fails the
      // handshake for every track on the host until the user trusts it, so the
      // same refund-and-park applies rather than burning down the queue.
      if (kind === "tls") {
        this.attempts.set(track.id, attempts - 1);
        this.tlsBlockedUntil = Date.now() + TLS_UNTRUSTED_PAUSE_MS;
      }
      const retryable =
        kind === "disk-full" ||
        kind === "tls" ||
        error instanceof DownloadCancelledError ||
        !getIsEffectivelyOnline() ||
        attempts < MAX_TRACK_ATTEMPTS;
      if (retryable) {
        // Logged out / switched servers, connectivity dropped under it, the
        // device ran out of space, the certificate isn't trusted, or a failure
        // we haven't yet seen enough of to call permanent. Keep the item
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
        // (disk-full, sockets, a track the server no longer has) and an
        // untrusted server certificate are dropped by the classifier —
        // isNativeEnvironmentFailure / isTlsTrustFailure / notFoundIsExpected.
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
    const { url, suffix } = offlineFileInfo(track);
    // Both read once and carried through the move below: the setting can be
    // changed and the server switched while these bytes are in flight, and
    // resolving the destination again afterwards would drop a file staged under
    // its export name into the id-named app-private directory, or file it under
    // the scope that happens to be active by then.
    const externalRoot = externalRootUri();
    const external = externalRoot !== null;
    const scope = currentAuthScope();

    // `File.downloadFileAsync` resolves its destination through `javaFile`,
    // which throws for a `content://` URI, so a download bound for a user-picked
    // SAF folder lands in app storage first and is moved across afterwards.
    // Staging also means the validations below run before anything appears in
    // someone's music directory.
    //
    // The staged file already carries its *final* name, because moving into a
    // directory makes SAF name the new document after the source. Each track
    // stages in its own subdirectory so two concurrent downloads that sanitize
    // to the same title can't collide.
    const stagingDir = external
      ? new Directory(
          Paths.cache,
          "offline-staging",
          track.id.replace(/[^a-zA-Z0-9_-]/g, "_"),
        )
      : internalScopedDirectory();
    stagingDir.create({ idempotent: true, intermediates: true });

    const stagedName = external
      ? exportFileName(track, suffix)
      : `${track.id}.${suffix}`;

    // Every abort below has to take the staging directory with it: it's a
    // per-track subdirectory of the cache that nothing else ever revisits, so
    // dropping only the file would leak an empty directory per aborted download.
    const discardStaged = (file: File) => {
      try {
        file.delete();
      } catch {}
      if (!external) return;
      try {
        if (stagingDir.exists) stagingDir.delete();
      } catch {}
    };

    let downloadResult = await File.downloadFileAsync(
      url,
      new File(stagingDir, stagedName),
      {
        idempotent: true,
        headers: requestHeadersForUrl(url),
      },
    );

    if (!downloadResult.exists) {
      discardStaged(downloadResult);
      throw new Error("Download failed - file does not exist");
    }

    if ((downloadResult.size ?? 0) < SUSPICIOUS_DOWNLOAD_BYTES) {
      // The read itself can throw (an unreadable staged file is exactly the kind
      // of thing that produces a suspicious size), and that path owes the
      // staging directory just as much as a rejected body does.
      let head: string;
      try {
        head = (await downloadResult.text()).trimStart();
      } catch (error) {
        discardStaged(downloadResult);
        throw error;
      }
      if (head.startsWith("{") || head.startsWith("<")) {
        discardStaged(downloadResult);
        throw new Error("Download failed - server returned an error response");
      }
    }

    if (generation !== this.generation) {
      discardStaged(downloadResult);
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
      discardStaged(downloadResult);
      throw new AutoDownloadDiscardedError("Extended offline mode disabled");
    }

    // Read before the move: the size is what the staging file weighs, and the
    // move itself is a stream copy across providers, not a rename.
    const downloadedSize = downloadResult.size || track.size || 0;

    if (external) {
      const staged = downloadResult;
      try {
        // Moved into the *directory*, never onto a path built with
        // `new File(dir, name)`: SAF URIs can't be path-joined, and letting the
        // provider name the document means `move` rewrites `staged.uri` to
        // wherever it actually landed, so the path we persist is the real one.
        //
        // `overwrite` is required rather than a convenience: expo-file-system
        // checks the destination directory for a document of the same name
        // itself and throws DestinationAlreadyExists before SAF is ever asked,
        // so without it re-downloading a track fails every attempt and feeds the
        // circuit breaker. The destination is scoped per (server, user), so a
        // collision is this session's own earlier copy of the same recording
        // (same artist, album, number and title) — never another server's file,
        // and never one of the user's own that happened to be in the folder
        // already. Replacing it is what re-downloading should mean.
        await staged.move(
          await resolveTargetDirectory(track, externalRoot, scope),
          { overwrite: true },
        );
      } catch (error) {
        // A cached folder URI only goes bad because the folder went away
        // underneath us; keeping it would make every retry fail identically.
        forgetCachedDirectory(track, externalRoot, scope);
        try {
          if (staged.exists) staged.delete();
        } catch {}
        throw error;
      } finally {
        try {
          if (stagingDir.exists) stagingDir.delete();
        } catch {}
      }
      downloadResult = staged;
    }

    const offlineTrack: OfflineTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration || 0,
      coverArt: track.coverArt,
      path: downloadResult.uri,
      size: downloadedSize,
      downloadedAt: new Date().toISOString(),
      source,
      track: track.track,
      discNumber: track.discNumber,
      albumArtist: track.displayAlbumArtist,
      year: track.year,
      genre: track.genre?.trim() || track.genres?.[0]?.name,
      sortName: track.sortName,
      sourceSuffix: track.suffix,
      sourceBitRate: track.bitRate,
      fileSuffix: suffix,
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
      // Fire-and-forget: an orphaned empty folder is cosmetic, and failing the
      // removal over one would leave the store and disk disagreeing.
      void pruneEmptyAlbumFolders(track).catch(() => {});
    } catch (error) {
      logError(`Error removing track ${trackId}:`, error);
      throw error;
    }
  }

  // Deletes the given tracks on behalf of `collectionId`, keeping any that
  // another saved collection still references so dropping one playlist doesn't
  // delete songs shared with another. Used both when a collection goes away
  // entirely and when its membership shrinks (a smart playlist re-evaluated
  // server-side, an edited playlist).
  removeTracksNotReferencedElsewhere(
    collectionId: string,
    trackIds: string[],
  ): void {
    const referencedElsewhere = trackIdsReferencedByCollections(
      Object.values(useOffline.getState().downloadedCollections).filter(
        (collection) => collection.id !== collectionId,
      ),
    );

    const orphaned: string[] = [];
    for (const trackId of trackIds) {
      if (referencedElsewhere.has(trackId)) continue;
      orphaned.push(trackId);
      try {
        this.removeDownloadedTrack(trackId);
      } catch (error) {
        logError(
          `Download Manager: Error removing track ${trackId} for collection ${collectionId}:`,
          error,
        );
      }
    }
    this.cancelQueuedDownloads(orphaned);
  }

  // Deleting the files isn't enough when the collection shrinks mid-download:
  // a track still waiting in the queue has nothing on disk for
  // `removeDownloadedTrack` to delete (it returns early), so it would finish
  // downloading afterwards and land in `downloadedTracks` with no collection
  // referencing it — an orphan only "clear all downloads" ever removes.
  // Tracks already in flight are left to finish, the same way
  // `removeQueuedAutoDownloads` does: they can't be cancelled.
  private cancelQueuedDownloads(trackIds: string[]): void {
    const offlineStore = useOffline.getState();
    const queued = new Set(offlineStore.downloadQueue.map((t) => t.id));
    const cancellable = trackIds.filter(
      (trackId) => queued.has(trackId) && !this.activeIds.has(trackId),
    );
    if (cancellable.length === 0) return;

    offlineStore.removeManyFromDownloadQueue(cancellable);
    for (const trackId of cancellable) {
      this.attempts.delete(trackId);
      const resolvers = this.resolvers.get(trackId);
      this.resolvers.delete(trackId);
      resolvers?.reject(
        new DownloadCancelledError("Track left the saved collection"),
      );
    }
  }

  // Removes a saved collection (playlist/album) and its tracks, but keeps any
  // track still referenced by another saved collection so removing one playlist
  // doesn't delete songs shared with another.
  removeCollection(collectionId: string, trackIds: string[]): void {
    this.removeTracksNotReferencedElsewhere(collectionId, trackIds);

    useOffline.getState().removeDownloadedCollection(collectionId);
    // Covers the removed collection was the last reference to go with it.
    // Deliberately not done per single-track removal: the prune walks the whole
    // cache against every collection, so the collection-level and
    // extended-offline-disable prunes are where it earns its cost.
    artworkCacheService.pruneOrphaned();
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
    const external = isExternalDownloadLocation();

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

      // Only ever recursively delete a directory the app owns. With an external
      // download location the "root" is a folder the user picked — quite
      // possibly their whole music library — so there the per-track deletes
      // above are the entire story, and we just tidy up the folders they
      // emptied.
      if (external) {
        // Cached covers are app-private wherever the tracks went, and the store
        // wipe below drops the index that makes them reachable — skipping them
        // here would strand the bytes with nothing left able to name them.
        if (scope) {
          const artworkDir = internalArtworkDirectory(scope);
          if (artworkDir.exists) artworkDir.delete();
        }
        // One pass per album, not per track: each pass costs two ContentResolver
        // listings against a tree that may be the user's whole music library,
        // and `pruneEmptyAlbumFolders` never suspends, so the loop has to yield
        // by hand or a large library clears with the UI frozen.
        //
        // Needs the scope for the same reason the artwork sweep above does: it
        // names the branch of the picked folder this session owns, and without
        // one there is no branch we may delete from.
        const pruned = new Set<string>();
        for (const track of tracks) {
          if (!scope) break;
          const album = albumSegments(track).join("/");
          if (pruned.has(album)) continue;
          pruned.add(album);
          try {
            await pruneEmptyAlbumFolders(track, scope);
          } catch {}
          if (pruned.size % DELETE_CHUNK === 0) {
            await yieldToEventLoop();
          }
        }
      } else if (scope) {
        const scopedDir = internalScopedDirectory(scope);
        if (scopedDir.exists) scopedDir.delete();
      }

      // The artwork directory and the cache index are both gone by now, so any
      // cover still in flight would re-register an entry pointing at a file
      // that no longer has a home.
      artworkCacheService.reset();
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

  // Whether a download is transferring right now. Read by the prefetch cache,
  // which is speculative and must yield the connection to a download the user
  // actually asked for (services/trackCache/prefetcher.ts).
  //
  // Deliberately in-flight only, not "queue is non-empty": a queue parked by
  // downloadsWifiOnly on cellular is competing for nothing, and treating it as
  // busy would switch the prefetch cache off for exactly the drive it exists
  // for. While a queue really is draining, its three concurrent transfers keep
  // this true often enough to hold prefetch back anyway.
  hasActiveWork(): boolean {
    return this.activeIds.size > 0;
  }

  isTrackDownloading(trackId: string): boolean {
    const progress = this.getDownloadProgress(trackId);
    return progress?.status === "downloading" || progress?.status === "pending";
  }
}

export const offlineDownloadService = OfflineDownloadService.getInstance();
