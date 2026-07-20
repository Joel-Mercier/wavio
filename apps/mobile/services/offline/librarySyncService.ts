import { Directory, File, Paths } from "expo-file-system";
import { getArtists } from "@/services/backend/browsing";
import { getPlaylist, getPlaylists } from "@/services/backend/playlists";
import { search3 } from "@/services/backend/searching";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import { offlineDownloadService } from "@/services/offline/downloadService";
import {
  ALBUM_PAGE_SIZE,
  advanceCursor,
  albumToAutoCollection,
  buildArtistArtworkAliases,
  buildTrackArtworkAliases,
  groupSongIdsByAlbum,
  isArtworkStale,
  isSongEnumerationComplete,
  isSyncStale,
  MIN_FREE_DISK_BYTES,
  planServerDeletions,
  playlistToAutoCollection,
  QUEUE_LOW_WATER,
  RETRY_BACKOFF_STEPS_MS,
  referencedArtworkIds,
  refreshedOfflineTrack,
  SONG_PAGE_SIZE,
  shouldWriteAutoCollection,
} from "@/services/offline/librarySyncPlan";
import { useAppBase } from "@/stores/app";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useLibrarySync from "@/stores/librarySync";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { artworkCacheKey } from "@/utils/artworkCacheKey";
import { logError } from "@/utils/log";

const ARTWORK_SIZE = 600;
// Covers are small next to audio files, so they can run wider than the track
// download queue without starving it.
const ARTWORK_CONCURRENCY = 4;
const ARTWORK_ATTEMPTS = 3;

// Subsonic error code 10: "required parameter is missing" — what a
// pre-OpenSubsonic server answers to the empty-query search3 the crawl relies
// on (the OpenSubsonic spec requires empty query = whole library).
const SUBSONIC_MISSING_PARAMETER = 10;

export type LibrarySyncCompletedResult = { downloadedCount: number };

// Fired once when a pass that actually downloaded something finishes AND its
// queued downloads have drained — i.e. the library just became fully cached.
// No-op resyncs stay silent. The root LibrarySyncController surfaces it as a
// toast (the service can't render UI itself).
const completedListeners = new Set<
  (result: LibrarySyncCompletedResult) => void
>();

export function subscribeLibrarySyncCompleted(
  cb: (result: LibrarySyncCompletedResult) => void,
): () => void {
  completedListeners.add(cb);
  return () => {
    completedListeners.delete(cb);
  };
}

const notifySyncCompleted = (result: LibrarySyncCompletedResult) => {
  for (const cb of completedListeners) cb(result);
};

// Covers queued or in flight. Kept out of the persisted crawl state — it
// changes thousands of times per pass, and re-serializing the crawl cursor
// (which holds the pass's seen-id inventory) on each would be wasteful. The
// crawl reaching "complete" doesn't mean the library is fully usable offline:
// artwork downloads trail it, so the settings row keeps reporting "syncing"
// until this hits zero.
let artworkProgress = { pending: 0, total: 0 };
const pendingArtworkListeners = new Set<() => void>();

export function subscribePendingArtwork(cb: () => void): () => void {
  pendingArtworkListeners.add(cb);
  return () => {
    pendingArtworkListeners.delete(cb);
  };
}

// One stable object identity per value, so useSyncExternalStore doesn't loop.
export const getArtworkProgress = (): { pending: number; total: number } =>
  artworkProgress;

// Progressive whole-library crawl for extended offline mode. Enumerates the
// active server through the backend dispatch layer (so Subsonic/Navidrome and
// Jellyfin both work) and feeds the existing offlineDownloadService queue:
//
//   albums    — paged empty-query search3; registers every album as an "auto"
//               OfflineCollection and sums songCount into the progress total.
//   songs     — paged empty-query search3, drain-coupled: the next page is
//               fetched only when the download queue is below QUEUE_LOW_WATER,
//               so the persisted queue stays small and the crawl follows
//               download pace. Song ids are appended to their album collection.
//   playlists — getPlaylists + getPlaylist each, registered as auto
//               collections (tracks are almost all downloaded by then).
//
// The cursor lives in stores/librarySync (scoped per server+user), so a killed
// app resumes where it left off. Everything runs in foreground JS, like the
// download queue itself.
export class LibrarySyncService {
  private static instance: LibrarySyncService;
  // Bumped on logout/server switch so in-flight steps discard their results.
  private generation = 0;
  private running = false;
  private pendingKick = false;
  private artworkQueue: string[] = [];
  // Ids either queued or in flight — the queue alone can't dedupe an id whose
  // download already started (shifted off), and a stale cover fetched twice
  // concurrently would orphan one of the two timestamped files.
  private artworkPending: Set<string> = new Set();
  private artworkActive = 0;
  // Attempts per cover in the current pass. A cover that fails is retried a
  // couple of times rather than dropped until the next pass — a handful of
  // covers lost to a transient blip is exactly what leaves scattered rows on
  // their fallback icon once the device goes offline.
  private artworkAttempts: Map<string, number> = new Map();
  // Backoff state for transient step failures — reset on any successful step.
  private failureCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    subscribeEffectiveOnline(() => {
      if (getIsEffectivelyOnline()) {
        this.startIfNeeded();
        this.processArtworkQueue();
      }
    });
    subscribeConnectionType((type) => {
      if (type === "wifi") {
        this.kick();
        this.processArtworkQueue();
      }
    });
    // Fetch the next songs page as the download queue drains below the low
    // water mark; a drain after the crawl completed may also mean the library
    // just became fully cached.
    useOffline.subscribe((state, prev) => {
      if (state.downloadQueue.length >= prev.downloadQueue.length) return;
      if (state.downloadQueue.length < QUEUE_LOW_WATER) {
        this.kick();
      }
      this.maybeNotifyFullyCached();
    });
  }

  static getInstance(): LibrarySyncService {
    if (!LibrarySyncService.instance) {
      LibrarySyncService.instance = new LibrarySyncService();
    }
    return LibrarySyncService.instance;
  }

  // Entry point for the root controller (toggle-on, app start/foreground,
  // reconnection). Starts a fresh pass when idle, restarts a stale completed
  // pass (delta resync), otherwise resumes from the persisted cursor.
  startIfNeeded(): void {
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return;
    if (sync.phase === "idle") {
      this.beginPass();
    } else if (sync.phase === "complete") {
      if (!isSyncStale(sync.lastSyncCompletedAt, Date.now())) return;
      this.beginPass();
    }
    this.backfillArtworkQueue();
    this.kick();
  }

  // Server switch / logout: drop in-flight work. The scoped stores are reset
  // by the app layout's scope-change effect.
  reset(): void {
    this.generation++;
    this.artworkQueue = [];
    this.artworkPending.clear();
    this.artworkAttempts.clear();
    this.syncPendingArtwork();
    this.failureCount = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // Toggle-off: stop the crawl and remove everything the sync downloaded,
  // keeping user-saved collections/tracks (and auto tracks they reference).
  disable(): void {
    this.reset();
    useLibrarySync.getState().__reset();
    offlineDownloadService.removeQueuedAutoDownloads();
    this.removeAutoContent();
  }

  // After "clear all downloads": the downloaded state is gone, so a still
  // enabled sync restarts from scratch. reset() first — an in-flight step
  // from the old pass must not write its stale cursor onto the fresh one.
  handleDownloadsCleared(): void {
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return;
    this.reset();
    this.beginPass();
    this.kick();
  }

  // Called after an online playlist mutation succeeds so the offline auto
  // copy reflects the edit immediately instead of waiting for the next pass.
  async refreshPlaylist(playlistId: string): Promise<void> {
    if (!useLibrarySync.getState().extendedOfflineModeEnabled) return;
    if (!getIsEffectivelyOnline()) return;
    const generation = this.generation;
    try {
      const detail = await getPlaylist(playlistId);
      if (generation !== this.generation) return;
      const withSongs = detail.playlist;
      if (!withSongs) return;
      const offlineStore = useOffline.getState();
      const existing = offlineStore.downloadedCollections[withSongs.id];
      if (!shouldWriteAutoCollection(existing)) return;
      offlineStore.addDownloadedCollection(
        playlistToAutoCollection(withSongs, existing),
      );
      this.enqueueArtwork(withSongs.coverArt);
      const entries = withSongs.entry ?? [];
      // A pass in flight reconciles against its seen inventory when it
      // completes — record this playlist and its songs so the refresh isn't
      // mistaken for server-deleted content (or swept from the queue).
      const { phase, appendSeenIds } = useLibrarySync.getState();
      if (phase !== "idle" && phase !== "complete") {
        appendSeenIds("playlist", [withSongs.id]);
        appendSeenIds(
          "song",
          entries.map((entry) => entry.id),
        );
      }
      offlineDownloadService.enqueueTracks(entries, "auto");
    } catch (error) {
      logError(`Library sync: error refreshing playlist ${playlistId}:`, error);
    }
  }

  // Playlist deleted server-side by the user: drop the auto copy right away.
  // Its tracks stay — they're still part of the library (album collections
  // keep them; a genuine server deletion is reconciled by the next pass).
  handlePlaylistDeleted(playlistId: string): void {
    if (!useLibrarySync.getState().extendedOfflineModeEnabled) return;
    const offlineStore = useOffline.getState();
    if (offlineStore.downloadedCollections[playlistId]?.source !== "auto") {
      return;
    }
    offlineStore.removeDownloadedCollection(playlistId);
  }

  private beginPass(): void {
    useLibrarySync.getState().setCrawl({
      phase: "albums",
      albumOffset: 0,
      songOffset: 0,
      totalSongs: 0,
      albumSongEstimate: 0,
      passTrusted: true,
      processedSongs: 0,
      seenAlbumIds: [],
      seenSongIds: [],
      seenPlaylistIds: [],
      passStartDownloadedCount: Object.keys(
        useOffline.getState().downloadedTracks,
      ).length,
      lastError: null,
    });
  }

  // The library counts as fully cached once the pass has completed AND its
  // queued auto downloads have drained (playlists-phase enqueues can outlive
  // the crawl). Evaluated one-shot per pass; a pass that downloaded nothing (a
  // delta resync with no server changes) stays silent.
  private maybeNotifyFullyCached(): void {
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return;
    if (sync.phase !== "complete") return;
    if (sync.passStartDownloadedCount === null) return;
    // Covers still downloading means the library isn't fully usable offline
    // yet; the artwork drain re-runs this check.
    if (artworkProgress.pending > 0) return;
    const offlineStore = useOffline.getState();
    if (
      offlineStore.downloadQueue.some(
        (queued) => queued.offlineSource === "auto",
      )
    ) {
      return;
    }
    const downloadedCount = Object.keys(offlineStore.downloadedTracks).length;
    const didDownload = downloadedCount > sync.passStartDownloadedCount;
    sync.setCrawl({ passStartDownloadedCount: null });
    if (didDownload) notifySyncCompleted({ downloadedCount });
  }

  private removeAutoContent(): void {
    const offlineStore = useOffline.getState();
    for (const collection of Object.values(
      offlineStore.downloadedCollections,
    )) {
      if (collection.source === "auto") {
        offlineStore.removeDownloadedCollection(collection.id);
      }
    }
    const referencedByUser = trackIdsReferencedByCollections(
      Object.values(useOffline.getState().downloadedCollections),
    );
    for (const track of offlineStore.getDownloadedTracksList()) {
      if (track.source !== "auto" || referencedByUser.has(track.id)) continue;
      try {
        offlineDownloadService.removeDownloadedTrack(track.id);
      } catch (error) {
        logError(`Library sync: error removing auto track ${track.id}:`, error);
      }
    }
    const { serverId, username } = useAuthBase.getState();
    if (serverId && username) {
      try {
        const artworkDir = this.artworkDir();
        if (artworkDir.exists) artworkDir.delete();
      } catch (error) {
        logError("Library sync: error removing cached artwork:", error);
      }
    }
    useOffline.getState().clearArtworkCache();
  }

  private syncPendingArtwork(): void {
    const pending = this.artworkQueue.length + this.artworkActive;
    // The denominator is the high-water mark of the current burst, so the
    // settings row can show "caching artwork 120/900"; it resets once the
    // queue drains so the next burst counts from zero.
    const total = pending === 0 ? 0 : Math.max(artworkProgress.total, pending);
    if (
      pending === artworkProgress.pending &&
      total === artworkProgress.total
    ) {
      return;
    }
    artworkProgress = { pending, total };
    for (const cb of pendingArtworkListeners) cb();
    if (pending === 0) this.maybeNotifyFullyCached();
  }

  private kick(): void {
    if (this.running) {
      this.pendingKick = true;
      return;
    }
    void this.runLoop();
  }

  private canProceed(): boolean {
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return false;
    if (sync.lastError === "unsupported") return false;
    const { url, username, serverType } = useAuthBase.getState();
    if (!url || !username || serverType === "local") return false;
    return getIsEffectivelyOnline();
  }

  private async runLoop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = this.generation;
    try {
      while (generation === this.generation) {
        if (!this.canProceed()) return;
        // A pending backoff timer owns the next attempt — queue-drain and
        // foreground kicks must not step around it and hammer a failing
        // server; the timer clears itself and kicks when it fires.
        if (this.retryTimer) return;
        const sync = useLibrarySync.getState();
        if (sync.phase === "idle" || sync.phase === "complete") return;
        if (
          sync.phase === "songs" &&
          useOffline.getState().downloadQueue.length >= QUEUE_LOW_WATER
        ) {
          return;
        }
        if (Paths.availableDiskSpace < MIN_FREE_DISK_BYTES) {
          if (sync.lastError !== "diskFull") {
            sync.setCrawl({ lastError: "diskFull" });
          }
          return;
        }
        if (sync.lastError === "diskFull") {
          sync.setCrawl({ lastError: null });
        }
        try {
          await this.step(generation);
          this.failureCount = 0;
        } catch (error) {
          if (generation !== this.generation) return;
          const current = useLibrarySync.getState();
          // A Subsonic "missing parameter" on the very first page means the
          // server predates OpenSubsonic's empty-query search3 and can't be
          // crawled at all; anything else is transient and retried with
          // backoff (plus the usual foreground/reconnect/queue-drain kicks).
          const unsupported =
            current.phase === "albums" &&
            current.albumOffset === 0 &&
            (error as { code?: number })?.code === SUBSONIC_MISSING_PARAMETER;
          current.setCrawl({
            lastError: unsupported ? "unsupported" : "syncFailed",
          });
          logError("Library sync: step failed:", error);
          if (!unsupported) this.scheduleRetry();
          return;
        }
      }
    } finally {
      this.running = false;
      if (this.pendingKick) {
        this.pendingKick = false;
        this.kick();
      }
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay =
      RETRY_BACKOFF_STEPS_MS[
        Math.min(this.failureCount, RETRY_BACKOFF_STEPS_MS.length - 1)
      ];
    this.failureCount++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.kick();
    }, delay);
  }

  private async step(generation: number): Promise<void> {
    switch (useLibrarySync.getState().phase) {
      case "albums":
        return this.stepAlbums(generation);
      case "artists":
        return this.stepArtists(generation);
      case "playlists":
        return this.stepPlaylists(generation);
      case "songs":
        return this.stepSongs(generation);
      default:
        return;
    }
  }

  private async stepAlbums(generation: number): Promise<void> {
    const { albumOffset, totalSongs, albumSongEstimate } =
      useLibrarySync.getState();
    const res = await search3("", {
      albumCount: ALBUM_PAGE_SIZE,
      albumOffset,
      songCount: 0,
      artistCount: 0,
    });
    if (generation !== this.generation) return;
    const albums = res.searchResult3?.album ?? [];
    // An empty *first* page is indistinguishable from a library with no albums,
    // but advanceCursor would read it as "phase done" and hand the songs phase
    // an empty album inventory — which reconcileServerDeletions would then take
    // as "every album was deleted server-side". Far likelier the server isn't
    // answering properly yet (cold start races probeServer, proxy warming up),
    // so fail the step and let the backoff retry it. A genuinely empty library
    // keeps retrying, which is harmless: there is nothing to cache either way.
    if (albumOffset === 0 && albums.length === 0) {
      throw new Error("Album enumeration returned no results");
    }
    const offlineStore = useOffline.getState();
    const collections: OfflineCollection[] = [];
    let discovered = 0;
    for (const album of albums) {
      discovered += album.songCount ?? 0;
      const existing = offlineStore.downloadedCollections[album.id];
      if (shouldWriteAutoCollection(existing)) {
        collections.push(albumToAutoCollection(album, existing));
      }
      this.enqueueArtwork(album.coverArt);
    }
    offlineStore.addDownloadedCollections(collections);
    if (__DEV__ && albumOffset === 0) {
      console.log("[librarySync] albums", {
        count: albums.length,
        sampleId: albums[0]?.id,
        sampleCoverArt: albums[0]?.coverArt,
        sampleArtistId: albums[0]?.artistId,
      });
    }
    const { nextOffset, pageDone } = advanceCursor(
      albumOffset,
      albums.length,
      ALBUM_PAGE_SIZE,
    );
    // Record seen ids before advancing the cursor: a crash in between re-crawls
    // the page (harmless duplicates) instead of leaving a gap that would read
    // as a server-side deletion.
    useLibrarySync.getState().appendSeenIds(
      "album",
      albums.map((album) => album.id),
    );
    useLibrarySync.getState().setCrawl({
      albumOffset: nextOffset,
      totalSongs: totalSongs + discovered,
      albumSongEstimate: albumSongEstimate + discovered,
      lastError: null,
      ...(pageDone ? { phase: "artists" as const } : {}),
    });
  }

  // Artist avatars are the one image the crawl can't derive from a collection:
  // albums carry an artistId but no artist cover. getArtists returns the whole
  // index in a single request, so this is a one-step phase.
  private async stepArtists(generation: number): Promise<void> {
    // Avatars are decorative and this phase reconciles nothing, so a failure
    // (an endpoint a backend doesn't implement, a transient error) advances
    // the crawl rather than blocking it behind the retry backoff — the next
    // pass picks the artists up.
    try {
      const res = await getArtists({});
      if (generation !== this.generation) return;
      const artists = (res.artists?.index ?? []).flatMap(
        (index) => index.artist ?? [],
      );
      for (const artist of artists) {
        this.enqueueArtwork(artist.coverArt);
      }
      const aliases = buildArtistArtworkAliases(artists);
      useOffline.getState().addArtworkAliases(aliases);
      if (__DEV__) {
        console.log("[librarySync] artists", {
          count: artists.length,
          withCoverArt: artists.filter((artist) => artist.coverArt).length,
          aliases: Object.keys(aliases).length,
          sampleId: artists[0]?.id,
          sampleCoverArt: artists[0]?.coverArt,
        });
      }
    } catch (error) {
      logError("Library sync: artist enumeration failed:", error);
      if (generation !== this.generation) return;
    }
    useLibrarySync.getState().setCrawl({
      phase: "playlists",
      lastError: null,
    });
  }

  private async stepSongs(generation: number): Promise<void> {
    const { songOffset, processedSongs, totalSongs } =
      useLibrarySync.getState();
    const res = await search3("", {
      songCount: SONG_PAGE_SIZE,
      songOffset,
      albumCount: 0,
      artistCount: 0,
    });
    if (generation !== this.generation) return;
    const songs = res.searchResult3?.song ?? [];
    // Same reasoning as the albums phase: an empty first page would complete
    // the pass with an empty song inventory and delete every auto track.
    if (songOffset === 0 && songs.length === 0) {
      throw new Error("Song enumeration returned no results");
    }
    offlineDownloadService.enqueueTracks(songs, "auto");
    const offlineStore = useOffline.getState();
    // Server edits to already-downloaded tracks (retitle, retag, renumber)
    // refresh the offline copy in place — the file itself is untouched.
    const refreshedTracks = songs.flatMap((song) => {
      const existing = offlineStore.downloadedTracks[song.id];
      if (!existing) return [];
      const refreshed = refreshedOfflineTrack(existing, song);
      return refreshed ? [refreshed] : [];
    });
    offlineStore.addDownloadedTracks(refreshedTracks);
    const songAliases = buildTrackArtworkAliases(
      songs,
      offlineStore.downloadedCollections,
    );
    offlineStore.addArtworkAliases(songAliases);
    if (__DEV__ && songOffset === 0) {
      console.log("[librarySync] songs", {
        count: songs.length,
        aliases: Object.keys(songAliases).length,
        sampleCoverArt: songs[0]?.coverArt,
        sampleAlbumId: songs[0]?.albumId,
      });
    }
    const updates: Record<string, string[]> = {};
    for (const [albumId, trackIds] of groupSongIdsByAlbum(songs)) {
      if (offlineStore.downloadedCollections[albumId]?.source === "auto") {
        updates[albumId] = trackIds;
      }
    }
    offlineStore.appendCollectionTrackIds(updates);
    const { nextOffset, pageDone } = advanceCursor(
      songOffset,
      songs.length,
      SONG_PAGE_SIZE,
    );
    const processed = processedSongs + songs.length;
    useLibrarySync.getState().appendSeenIds(
      "song",
      songs.map((song) => song.id),
    );
    // The songs enumeration just ended (a page shorter than SONG_PAGE_SIZE is
    // how the protocol signals "last page"). That's also exactly how a
    // truncated page looks, so cross-check the total against the albums phase's
    // independent estimate before letting this pass delete anything.
    let passTrusted = true;
    if (pageDone) {
      const sync = useLibrarySync.getState();
      const uniqueSeenSongs = new Set(sync.seenSongIds).size;
      passTrusted = isSongEnumerationComplete(
        uniqueSeenSongs,
        sync.albumSongEstimate,
      );
      if (!passTrusted) {
        logError(
          `Library sync: song enumeration looks truncated (${uniqueSeenSongs} of ~${sync.albumSongEstimate}); skipping deletion reconciliation for this pass`,
        );
      }
    }
    useLibrarySync.getState().setCrawl({
      songOffset: nextOffset,
      processedSongs: processed,
      // The album-phase estimate can undercount (orphan songs outside any
      // album); never let the denominator fall below what was actually seen.
      totalSongs: Math.max(totalSongs, processed),
      lastError: null,
      ...(pageDone
        ? {
            phase: "complete" as const,
            passTrusted,
            lastSyncCompletedAt: new Date().toISOString(),
          }
        : {}),
    });
    if (!pageDone) return;
    // Songs is the last phase, so the pass's inventory is complete here.
    this.reconcileServerDeletions();
    useLibrarySync.getState().setCrawl({
      // The inventory has been reconciled; drop it so the persisted blob
      // stays small.
      seenAlbumIds: [],
      seenSongIds: [],
      seenPlaylistIds: [],
    });
    // The queue may already be empty (downloads outpaced the crawl) — check
    // now rather than waiting for a drain event that will never come.
    this.maybeNotifyFullyCached();
  }

  private async stepPlaylists(generation: number): Promise<void> {
    const res = await getPlaylists({});
    if (generation !== this.generation) return;
    const playlists = res.playlists?.playlist ?? [];
    useLibrarySync.getState().appendSeenIds(
      "playlist",
      playlists.map((playlist) => playlist.id),
    );
    for (const playlist of playlists) {
      const detail = await getPlaylist(playlist.id);
      if (generation !== this.generation) return;
      const withSongs = detail.playlist;
      if (!withSongs) continue;
      const offlineStore = useOffline.getState();
      const existing = offlineStore.downloadedCollections[withSongs.id];
      if (shouldWriteAutoCollection(existing)) {
        offlineStore.addDownloadedCollection(
          playlistToAutoCollection(withSongs, existing),
        );
      }
      this.enqueueArtwork(withSongs.coverArt);
      const entries = withSongs.entry ?? [];
      // Playlist entries also prove their songs still exist server-side (a
      // song added mid-crawl can miss the songs-phase pages).
      useLibrarySync.getState().appendSeenIds(
        "song",
        entries.map((entry) => entry.id),
      );
      offlineStore.addArtworkAliases(
        buildTrackArtworkAliases(entries, offlineStore.downloadedCollections),
      );
      offlineDownloadService.enqueueTracks(entries, "auto");
    }
    useLibrarySync.getState().setCrawl({
      phase: "songs",
      lastError: null,
    });
  }

  // Runs once at the end of a complete pass. The server is the source of
  // truth: auto content whose id the pass never saw was deleted server-side,
  // so it's removed locally too (files included). User-saved content is never
  // touched. Interrupted passes never get here, so a partial inventory can't
  // masquerade as deletions.
  private reconcileServerDeletions(): void {
    const { seenAlbumIds, seenSongIds, seenPlaylistIds, passTrusted } =
      useLibrarySync.getState();
    // A pass with enumeration gaps can't tell "deleted server-side" from
    // "never fetched". Skipping reconciliation only defers cleanup to the next
    // (complete) pass; acting on a partial inventory deletes cached content.
    if (!passTrusted) return;
    const seenSongs = new Set(seenSongIds);
    const offlineStore = useOffline.getState();
    const plan = planServerDeletions({
      collections: offlineStore.downloadedCollections,
      tracks: offlineStore.downloadedTracks,
      seenAlbumIds: new Set(seenAlbumIds),
      seenSongIds: seenSongs,
      seenPlaylistIds: new Set(seenPlaylistIds),
    });
    if (__DEV__) {
      // Unique counts: the seen arrays are append-only and playlists re-append
      // song ids they share with the songs phase, so raw lengths overcount.
      console.log("[librarySync] reconcile", {
        seenAlbums: new Set(seenAlbumIds).size,
        seenSongs: seenSongs.size,
        seenPlaylists: new Set(seenPlaylistIds).size,
        removingCollections: plan.removeCollectionIds.length,
        removingTracks: plan.removeTrackIds.length,
        ofCollections: Object.keys(offlineStore.downloadedCollections).length,
        ofTracks: Object.keys(offlineStore.downloadedTracks).length,
      });
    }
    offlineStore.removeDownloadedCollections(plan.removeCollectionIds);
    offlineStore.replaceCollectionTrackIds(plan.replaceAlbumTrackIds);
    for (const trackId of plan.removeTrackIds) {
      try {
        offlineDownloadService.removeDownloadedTrack(trackId);
      } catch (error) {
        logError(
          `Library sync: error removing deleted track ${trackId}:`,
          error,
        );
      }
    }
    const staleQueuedIds = new Set(
      offlineStore.downloadQueue
        .filter(
          (queued) =>
            queued.offlineSource === "auto" && !seenSongs.has(queued.id),
        )
        .map((queued) => queued.id),
    );
    offlineDownloadService.removeQueuedAutoDownloads(staleQueuedIds);
    this.pruneOrphanedArtwork();
  }

  // Drops cached covers no longer referenced by any collection (their album,
  // playlist or artist was deleted server-side), then the aliases that pointed
  // at them.
  private pruneOrphanedArtwork(): void {
    const offlineStore = useOffline.getState();
    const referenced = referencedArtworkIds(
      Object.values(offlineStore.downloadedCollections),
      offlineStore.artworkAliases,
    );
    const orphaned = Object.entries(offlineStore.artworkCache).filter(
      ([coverArt]) => !referenced.has(coverArt),
    );
    if (orphaned.length > 0) {
      for (const [, uri] of orphaned) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {}
      }
      offlineStore.removeCachedArtwork(orphaned.map(([coverArt]) => coverArt));
    }
    useOffline.getState().pruneArtworkAliases();
  }

  private artworkDir(): Directory {
    return new Directory(
      Paths.document,
      "offline",
      currentAuthScope(),
      "artwork",
    );
  }

  // Covers are cached once per unique coverArt id (album/playlist level, not
  // per track) so offline screens keep their artwork — see the fallback in
  // utils/artwork.ts. The queue is in-memory; backfillArtworkQueue re-derives
  // missing covers from the registered collections after a restart.
  private enqueueArtwork(coverArt?: string): void {
    if (!coverArt) return;
    const { artworkCache, artworkCachedAt } = useOffline.getState();
    const key = artworkCacheKey(coverArt);
    // A fresh cache entry is kept; a stale one is re-fetched so covers
    // replaced on the server propagate even when the coverArt id is stable
    // (Jellyfin item GUIDs never change when the image does).
    if (
      artworkCache[key] &&
      !isArtworkStale(artworkCachedAt[key], Date.now())
    ) {
      return;
    }
    if (this.artworkPending.has(key)) return;
    this.artworkPending.add(key);
    this.artworkQueue.push(coverArt);
    this.syncPendingArtwork();
    this.processArtworkQueue();
  }

  private backfillArtworkQueue(): void {
    if (!getIsEffectivelyOnline()) return;
    for (const collection of Object.values(
      useOffline.getState().downloadedCollections,
    )) {
      if (collection.source === "auto") {
        this.enqueueArtwork(collection.coverArt);
      }
    }
  }

  private processArtworkQueue(): void {
    const { downloadsWifiOnly } = useAppBase.getState();
    if (downloadsWifiOnly && getConnectionType() !== "wifi") return;
    while (this.artworkActive < ARTWORK_CONCURRENCY) {
      const coverArt = this.artworkQueue.shift();
      if (!coverArt) return;
      const generation = this.generation;
      this.artworkActive++;
      void this.downloadArtwork(coverArt, generation).then((ok) => {
        this.artworkActive--;
        const key = artworkCacheKey(coverArt);
        const attempts = (this.artworkAttempts.get(key) ?? 0) + 1;
        if (
          !ok &&
          generation === this.generation &&
          attempts < ARTWORK_ATTEMPTS
        ) {
          this.artworkAttempts.set(key, attempts);
          this.artworkQueue.push(coverArt);
        } else {
          this.artworkAttempts.delete(key);
          this.artworkPending.delete(key);
        }
        this.syncPendingArtwork();
        this.processArtworkQueue();
      });
    }
  }

  // Resolves true when the cover is on disk (or the attempt is moot), false
  // when it should be retried.
  private async downloadArtwork(
    coverArt: string,
    generation: number,
  ): Promise<boolean> {
    try {
      const { serverId, username } = useAuthBase.getState();
      if (!serverId || !username) return true;
      const dir = this.artworkDir();
      dir.create({ idempotent: true, intermediates: true });
      // Timestamped filename: a refreshed cover must get a NEW file:// URI,
      // else expo-image's URI-keyed cache keeps showing the old bytes.
      const key = artworkCacheKey(coverArt);
      const fileName = `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}_${Date.now()}.jpg`;
      const previous = useOffline.getState().artworkCache[key];
      const result = await File.downloadFileAsync(
        artworkUrl(coverArt, ARTWORK_SIZE),
        new File(dir, fileName),
        { idempotent: true },
      );
      if (generation !== this.generation) {
        try {
          result.delete();
        } catch {}
        return true;
      }
      if (!result.exists) return false;
      useOffline.getState().addCachedArtwork(key, result.uri);
      if (previous && previous !== result.uri) {
        try {
          const previousFile = new File(previous);
          if (previousFile.exists) previousFile.delete();
        } catch {}
      }
      return true;
    } catch (error) {
      // Artwork is decorative — a failure is retried in-pass and then on the
      // next backfill, never surfaced as a sync error.
      if (__DEV__) {
        console.log(`Library sync: artwork ${coverArt} download failed`, error);
      }
      return false;
    }
  }
}

export const librarySyncService = LibrarySyncService.getInstance();
