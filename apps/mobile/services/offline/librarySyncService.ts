import { Paths } from "expo-file-system";
import { getArtists } from "@/services/backend/browsing";
import { getPlaylist, getPlaylists } from "@/services/backend/playlists";
import { search3 } from "@/services/backend/searching";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import {
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  artworkCacheService,
  getArtworkProgress,
  subscribePendingArtwork,
} from "@/services/offline/artworkCacheService";
import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import { isExternalDownloadLocation } from "@/services/offline/downloadDestination";
import {
  DELETE_CHUNK,
  type DeleteProgress,
  offlineDownloadService,
  yieldToEventLoop,
} from "@/services/offline/downloadService";
import {
  ALBUM_PAGE_SIZE,
  advanceCursor,
  albumToAutoCollection,
  buildArtistArtworkAliases,
  groupSongIdsByAlbum,
  hasUnseenAutoTracks,
  isSongEnumerationComplete,
  isSyncStale,
  MIN_FREE_DISK_BYTES,
  MIN_FREE_STAGING_BYTES,
  nextSongCalibration,
  planServerDeletions,
  planTrackArtwork,
  playlistToAutoCollection,
  QUEUE_LOW_WATER,
  RETRY_BACKOFF_STEPS_MS,
  refreshedOfflineTrack,
  SONG_PAGE_SIZE,
  shouldWriteAutoCollection,
  songEnumerationBaseline,
} from "@/services/offline/librarySyncPlan";
import { useAuthBase } from "@/stores/auth";
import useLibrarySync, { isIdMigrationFrozen } from "@/stores/librarySync";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import { logError } from "@/utils/log";

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
  // Backoff state for transient step failures — reset on any successful step.
  private failureCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    subscribeEffectiveOnline(() => {
      if (getIsEffectivelyOnline()) this.startIfNeeded();
    });
    subscribeConnectionType((type) => {
      if (type === "wifi") this.kick();
    });
    // The artwork cache is a separate service now, so the completion check has
    // to be driven from its progress rather than from inside its drain: a
    // library whose covers are still coming down isn't fully cached yet.
    subscribePendingArtwork(() => {
      if (getArtworkProgress().pending === 0) this.maybeNotifyFullyCached();
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
    // An index-backed backend has no server API to crawl, so there is nothing
    // to start; the crawl loop guards this via canProceed() too.
    const { url, username, serverType } = useAuthBase.getState();
    if (!url || !username || isIndexBackedType(serverType)) return;
    const sync = useLibrarySync.getState();
    if (!sync.extendedOfflineModeEnabled) return;
    // Runs before the phase branch so a completed pass — where the backfill is
    // the only thing that still fetches covers — picks artwork back up too.
    artworkCacheService.resume();
    if (sync.phase === "idle") {
      this.beginPass();
    } else if (sync.phase === "complete") {
      if (!isSyncStale(sync.lastSyncCompletedAt, Date.now())) return;
      this.beginPass();
    }
    this.kick();
  }

  // Server switch / logout: drop in-flight work. The scoped stores are reset
  // by the app layout's scope-change effect.
  reset(): void {
    this.generation++;
    this.failureCount = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // Toggle-off: stop the crawl and remove everything the sync downloaded,
  // keeping user-saved collections/tracks (and auto tracks they reference).
  async disable(onProgress?: DeleteProgress): Promise<void> {
    this.reset();
    // Drops covers still in flight before the prune below, so one can't land
    // after it and sit on disk unreferenced. The artwork queue is shared with
    // manual downloads and can't be filtered by source, so this takes a
    // user-saved collection's pending covers with it — hence the backfill once
    // the prune is done, which re-derives whatever user content still needs.
    artworkCacheService.reset();
    useLibrarySync.getState().__reset();
    offlineDownloadService.removeQueuedAutoDownloads();
    await this.removeAutoContent(onProgress);
    artworkCacheService.resume();
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
      artworkCacheService.enqueue(withSongs.coverArt);
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
    if (getArtworkProgress().pending > 0) return;
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

  private async removeAutoContent(onProgress?: DeleteProgress): Promise<void> {
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
    const autoTracks = offlineStore
      .getDownloadedTracksList()
      .filter(
        (track) => track.source === "auto" && !referencedByUser.has(track.id),
      );
    const total = autoTracks.length;
    onProgress?.(0, total);
    let done = 0;
    for (const track of autoTracks) {
      try {
        offlineDownloadService.removeDownloadedTrack(track.id);
      } catch (error) {
        logError(`Library sync: error removing auto track ${track.id}:`, error);
      }
      done++;
      if (done % DELETE_CHUNK === 0) {
        onProgress?.(done, total);
        await yieldToEventLoop();
      }
    }
    onProgress?.(total, total);
    // Prune rather than wipe: the artwork cache is no longer the crawl's alone.
    // A cover the user's own saved collections and tracks still reference has to
    // survive toggling extended offline off — the exact parallel of the
    // referencedByUser guard on tracks above.
    artworkCacheService.pruneOrphaned();
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
    // A pending canonical-id migration makes seenSongIds meaningless: the crawl
    // would enumerate renumbered ids, and reconcileServerDeletions would read
    // every locally-stored id as deleted server-side and wipe the files.
    if (isIdMigrationFrozen()) return false;
    const { url, username, serverType } = useAuthBase.getState();
    if (!url || !username || isIndexBackedType(serverType)) return false;
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
        // Paths.availableDiskSpace measures internal storage. With downloads
        // pointed at a user-picked folder — very possibly an SD card — that
        // number describes the wrong volume for the library itself, and holding
        // the crawl to the full floor would report "disk full" about a disk the
        // files aren't going to. It isn't irrelevant either: every one of those
        // downloads still stages a full copy in app storage before the move, so
        // internal space that can't hold a track stalls the queue just as hard,
        // only as a cascade of failures instead of a clean stop. There's no
        // free-space API for a SAF tree, so the external threshold covers the
        // staging copy alone and a genuinely full card surfaces as a download
        // failure.
        const minFreeBytes = isExternalDownloadLocation()
          ? MIN_FREE_STAGING_BYTES
          : MIN_FREE_DISK_BYTES;
        if (Paths.availableDiskSpace < minFreeBytes) {
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
      artworkCacheService.enqueue(album.coverArt);
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
        artworkCacheService.enqueue(artist.coverArt);
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
    const { aliases: songAliases, covers: songCovers } = planTrackArtwork(
      songs,
      offlineStore.downloadedCollections,
      offlineStore.artworkAliases,
    );
    offlineStore.addArtworkAliases(songAliases);
    // Almost always covers the albums phase already enqueued (enqueue dedupes on
    // the cache), so this is really about the songs it didn't: one whose album
    // the crawl hasn't reached, or isn't registering at all.
    for (const coverArt of songCovers) {
      artworkCacheService.enqueue(coverArt);
    }
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
    // truncated page looks, so cross-check the total against an independent
    // baseline before letting this pass delete anything.
    let passTrusted = true;
    if (pageDone) {
      const sync = useLibrarySync.getState();
      const seenSongIds = new Set(sync.seenSongIds);
      const uniqueSeenSongs = seenSongIds.size;
      const baseline = songEnumerationBaseline(sync.albumSongEstimate, sync);
      passTrusted = isSongEnumerationComplete(uniqueSeenSongs, baseline);
      useLibrarySync.getState().setCalibration({
        ...nextSongCalibration({
          uniqueSeenSongs,
          albumSongEstimate: sync.albumSongEstimate,
          passTrusted,
          calibration: sync,
          lastPassSongCount: sync.lastPassSongCount,
          unseenAutoTracks: hasUnseenAutoTracks(
            useOffline.getState().downloadedTracks,
            seenSongIds,
          ),
        }),
        lastPassSongCount: uniqueSeenSongs,
      });
      if (!passTrusted) {
        // Falling short while there is no measured baseline yet is expected:
        // the pass is judged against the album bootstrap, which a server that
        // keeps rows for absent files can never satisfy. Not worth reporting —
        // logError ships to Sentry.
        const message = `Library sync: song enumeration looks truncated (${uniqueSeenSongs} of ~${baseline}); skipping deletion reconciliation for this pass`;
        if (sync.enumerableSongCount === null) {
          if (__DEV__) {
            console.log(`[librarySync] ${message} (no measured baseline yet)`);
          }
        } else {
          logError(message);
        }
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
      artworkCacheService.enqueue(withSongs.coverArt);
      const entries = withSongs.entry ?? [];
      // Playlist entries also prove their songs still exist server-side (a
      // song added mid-crawl can miss the songs-phase pages).
      useLibrarySync.getState().appendSeenIds(
        "song",
        entries.map((entry) => entry.id),
      );
      // A playlist's member albums usually aren't registered collections, so its
      // entries group onto one cover per album rather than the playlist's own.
      const entryArtwork = planTrackArtwork(
        entries,
        offlineStore.downloadedCollections,
        offlineStore.artworkAliases,
      );
      offlineStore.addArtworkAliases(entryArtwork.aliases);
      for (const coverArt of entryArtwork.covers) {
        artworkCacheService.enqueue(coverArt);
      }
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
    // canProceed() gates the loop, but a step already in flight when the freeze
    // engages (the interceptor can set it from that very response) still lands
    // here with an inventory of pre-migration ids — against which every local
    // id reads as deleted server-side.
    if (isIdMigrationFrozen()) return;
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
    artworkCacheService.pruneOrphaned();
  }
}

export const librarySyncService = LibrarySyncService.getInstance();
