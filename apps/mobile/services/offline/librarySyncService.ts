import { Directory, File, Paths } from "expo-file-system";
import { getPlaylist, getPlaylists } from "@/services/backend/playlists";
import { search3 } from "@/services/backend/searching";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import { offlineDownloadService } from "@/services/offline/downloadService";
import {
  ALBUM_PAGE_SIZE,
  advanceCursor,
  albumToAutoCollection,
  groupSongIdsByAlbum,
  isSyncStale,
  MIN_FREE_DISK_BYTES,
  planServerDeletions,
  playlistToAutoCollection,
  QUEUE_LOW_WATER,
  SONG_PAGE_SIZE,
  shouldWriteAutoCollection,
} from "@/services/offline/librarySyncPlan";
import { useAppBase } from "@/stores/app";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useLibrarySync from "@/stores/librarySync";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { logError } from "@/utils/log";

const ARTWORK_SIZE = 600;
const ARTWORK_CONCURRENCY = 2;

// Subsonic error code 10: "required parameter is missing" — what a
// pre-OpenSubsonic server answers to the empty-query search3 the crawl relies
// on (the OpenSubsonic spec requires empty query = whole library).
const SUBSONIC_MISSING_PARAMETER = 10;

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
  private artworkActive = 0;

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
    // water mark.
    useOffline.subscribe((state, prev) => {
      if (
        state.downloadQueue.length < prev.downloadQueue.length &&
        state.downloadQueue.length < QUEUE_LOW_WATER
      ) {
        this.kick();
      }
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
  }

  // Toggle-off: stop the crawl and remove everything the sync downloaded,
  // keeping user-saved collections/tracks (and auto tracks they reference).
  disable(): void {
    this.generation++;
    this.artworkQueue = [];
    useLibrarySync.getState().__reset();
    offlineDownloadService.removeQueuedAutoDownloads();
    this.removeAutoContent();
  }

  // After "clear all downloads": the downloaded state is gone, so a still
  // enabled sync restarts from scratch.
  handleDownloadsCleared(): void {
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return;
    this.beginPass();
    this.kick();
  }

  private beginPass(): void {
    useLibrarySync.getState().setCrawl({
      phase: "albums",
      albumOffset: 0,
      songOffset: 0,
      totalSongs: 0,
      processedSongs: 0,
      seenAlbumIds: [],
      seenSongIds: [],
      seenPlaylistIds: [],
      lastError: null,
    });
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
    const referencedByUser = new Set(
      Object.values(useOffline.getState().downloadedCollections).flatMap(
        (collection) => collection.trackIds,
      ),
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
        } catch (error) {
          if (generation !== this.generation) return;
          const current = useLibrarySync.getState();
          // A Subsonic "missing parameter" on the very first page means the
          // server predates OpenSubsonic's empty-query search3 and can't be
          // crawled at all; anything else is transient and retried on the
          // next kick (foreground, reconnect, queue drain).
          const unsupported =
            current.phase === "albums" &&
            current.albumOffset === 0 &&
            (error as { code?: number })?.code === SUBSONIC_MISSING_PARAMETER;
          current.setCrawl({
            lastError: unsupported ? "unsupported" : "syncFailed",
          });
          logError("Library sync: step failed:", error);
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

  private async step(generation: number): Promise<void> {
    switch (useLibrarySync.getState().phase) {
      case "albums":
        return this.stepAlbums(generation);
      case "songs":
        return this.stepSongs(generation);
      case "playlists":
        return this.stepPlaylists(generation);
      default:
        return;
    }
  }

  private async stepAlbums(generation: number): Promise<void> {
    const { albumOffset, totalSongs } = useLibrarySync.getState();
    const res = await search3("", {
      albumCount: ALBUM_PAGE_SIZE,
      albumOffset,
      songCount: 0,
      artistCount: 0,
    });
    if (generation !== this.generation) return;
    const albums = res.searchResult3?.album ?? [];
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
      lastError: null,
      ...(pageDone ? { phase: "songs" as const } : {}),
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
    offlineDownloadService.enqueueTracks(songs, "auto");
    const offlineStore = useOffline.getState();
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
    useLibrarySync.getState().setCrawl({
      songOffset: nextOffset,
      processedSongs: processed,
      // The album-phase estimate can undercount (orphan songs outside any
      // album); never let the denominator fall below what was actually seen.
      totalSongs: Math.max(totalSongs, processed),
      lastError: null,
      ...(pageDone ? { phase: "playlists" as const } : {}),
    });
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
      offlineDownloadService.enqueueTracks(entries, "auto");
    }
    this.reconcileServerDeletions();
    useLibrarySync.getState().setCrawl({
      phase: "complete",
      // The pass's inventory has been reconciled; drop it so the persisted
      // blob stays small.
      seenAlbumIds: [],
      seenSongIds: [],
      seenPlaylistIds: [],
      lastError: null,
      lastSyncCompletedAt: new Date().toISOString(),
    });
  }

  // Runs once at the end of a complete pass. The server is the source of
  // truth: auto content whose id the pass never saw was deleted server-side,
  // so it's removed locally too (files included). User-saved content is never
  // touched. Interrupted passes never get here, so a partial inventory can't
  // masquerade as deletions.
  private reconcileServerDeletions(): void {
    const { seenAlbumIds, seenSongIds, seenPlaylistIds } =
      useLibrarySync.getState();
    const seenSongs = new Set(seenSongIds);
    const offlineStore = useOffline.getState();
    const plan = planServerDeletions({
      collections: offlineStore.downloadedCollections,
      tracks: offlineStore.downloadedTracks,
      seenAlbumIds: new Set(seenAlbumIds),
      seenSongIds: seenSongs,
      seenPlaylistIds: new Set(seenPlaylistIds),
    });
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

  // Drops cached covers no longer referenced by any collection (their album
  // or playlist was deleted server-side).
  private pruneOrphanedArtwork(): void {
    const offlineStore = useOffline.getState();
    const referenced = new Set(
      Object.values(offlineStore.downloadedCollections)
        .map((collection) => collection.coverArt)
        .filter((coverArt): coverArt is string => Boolean(coverArt)),
    );
    const orphaned = Object.entries(offlineStore.artworkCache).filter(
      ([coverArt]) => !referenced.has(coverArt),
    );
    if (orphaned.length === 0) return;
    for (const [, uri] of orphaned) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {}
    }
    offlineStore.removeCachedArtwork(orphaned.map(([coverArt]) => coverArt));
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
    if (useOffline.getState().artworkCache[coverArt]) return;
    if (this.artworkQueue.includes(coverArt)) return;
    this.artworkQueue.push(coverArt);
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
      this.artworkActive++;
      void this.downloadArtwork(coverArt, this.generation).finally(() => {
        this.artworkActive--;
        this.processArtworkQueue();
      });
    }
  }

  private async downloadArtwork(
    coverArt: string,
    generation: number,
  ): Promise<void> {
    try {
      const { serverId, username } = useAuthBase.getState();
      if (!serverId || !username) return;
      const dir = this.artworkDir();
      dir.create({ idempotent: true, intermediates: true });
      const fileName = `${coverArt.replace(/[^a-zA-Z0-9._-]/g, "_")}.jpg`;
      const result = await File.downloadFileAsync(
        artworkUrl(coverArt, ARTWORK_SIZE),
        new File(dir, fileName),
        { idempotent: true },
      );
      if (generation !== this.generation) {
        try {
          result.delete();
        } catch {}
        return;
      }
      if (result.exists) {
        useOffline.getState().addCachedArtwork(coverArt, result.uri);
      }
    } catch (error) {
      // Artwork is decorative — a failed cover is retried on the next
      // backfill, never surfaced as a sync error.
      if (__DEV__) {
        console.log(`Library sync: artwork ${coverArt} download failed`, error);
      }
    }
  }
}

export const librarySyncService = LibrarySyncService.getInstance();
