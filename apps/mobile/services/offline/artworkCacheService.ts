import { type Directory, File } from "expo-file-system";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import { isTlsTrustFailure } from "@/services/errorReporting";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
} from "@/services/network";
import { internalArtworkDirectory } from "@/services/offline/downloadDestination";
import {
  isArtworkStale,
  planTrackArtwork,
  referencedArtworkIds,
} from "@/services/offline/librarySyncPlan";
import type { Child } from "@/services/openSubsonic/types";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { artworkCacheKey } from "@/utils/artworkCacheKey";

const ARTWORK_SIZE = 600;
// Covers are small next to audio files, so they can run wider than the track
// download queue without starving it.
const ARTWORK_CONCURRENCY = 4;
const ARTWORK_ATTEMPTS = 3;

// A cover id that is already a URI the app can't ask the server for: the local
// backend stores a `file://` path to artwork it extracted, and a `data:` cover
// is inline bytes. Both are unfetchable here — downloadFileAsync throws "URI is
// not absolute" on the first. An `https://` id (podcast feed images) is left in:
// it is a real remote cover, and caching it is the whole point offline.
const isUnfetchableArtworkId = (id: string) => /^(file|data):/i.test(id);

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

// Downloads and evicts the cover art that makes offline screens — lists, the
// player, the media notification — render real artwork instead of a fallback
// icon. Two producers feed it: the extended-offline library crawl
// (librarySyncService) and every manual download entry point, via
// `cacheArtworkForTracks` below. Neither is privileged: downloading is
// downloading, and a manually saved album must be as usable offline as a
// crawled one.
//
// The queue is in-memory only. `backfill()` re-derives what is still missing
// from everything the offline store does persist — registered collections,
// downloaded tracks and the download queue — so a restart resumes without
// persisting anything.
export class ArtworkCacheService {
  private static instance: ArtworkCacheService;
  // Bumped on logout/server switch so in-flight downloads discard their files.
  private generation = 0;
  private queue: string[] = [];
  // Ids either queued or in flight — the queue alone can't dedupe an id whose
  // download already started (shifted off), and a stale cover fetched twice
  // concurrently would orphan one of the two timestamped files.
  private pending: Set<string> = new Set();
  private active = 0;
  // Attempts per cover in the current pass. A cover that fails is retried a
  // couple of times rather than dropped until the next backfill — a handful of
  // covers lost to a transient blip is exactly what leaves scattered rows on
  // their fallback icon once the device goes offline.
  private attempts: Map<string, number> = new Map();
  // Set when a cover fetch fails the TLS handshake. Every other cover comes from
  // the same host, so they would all fail identically — retrying just burns
  // ARTWORK_ATTEMPTS per cover on every backfill. Cleared by reset() and by
  // resume(), so re-trusting the certificate picks artwork back up on the next
  // app foreground / reconnection rather than needing a server switch.
  private trustBlocked = false;

  private constructor() {
    subscribeEffectiveOnline(() => {
      // Reconnecting is also when a manual-download-only user's queue — which
      // no crawl will ever refill — has to be rebuilt from their collections.
      if (getIsEffectivelyOnline()) this.resume();
    });
    subscribeConnectionType((type) => {
      if (type === "wifi") this.processQueue();
    });
  }

  static getInstance(): ArtworkCacheService {
    if (!ArtworkCacheService.instance) {
      ArtworkCacheService.instance = new ArtworkCacheService();
    }
    return ArtworkCacheService.instance;
  }

  // Covers are cached once per unique coverArt id (collection level for tracks
  // whose album is registered, track level otherwise) so offline screens keep
  // their artwork — see the fallback in utils/artwork.ts.
  enqueue(coverArt?: string): void {
    if (!coverArt) return;
    // The guards live here rather than at the call sites because every download
    // entry point feeds this queue.
    const { url, username, serverType } = useAuthBase.getState();
    if (!url || !username) return;
    if (isUnfetchableArtworkId(coverArt)) return;
    // An index-backed backend has no cover endpoint — `artworkUrl` hands the id
    // straight back — so only an id that is already an absolute remote URL can
    // be fetched. That is exactly the on-device podcast case (its `coverArt` is
    // the feed's image URL, see services/local/mappers.ts), which is the one
    // cover such a backend does lose offline; its music covers are `file://`
    // paths already on disk and were dropped by the check above.
    if (isIndexBackedType(serverType) && !/^https?:/i.test(coverArt)) return;
    // Accepting covers the drain refuses to touch would leave artworkProgress
    // stuck on a "caching artwork x/y" row that never advances for the rest of
    // the session, since producers keep enqueuing long after the block.
    if (this.trustBlocked) return;
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
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.queue.push(coverArt);
    this.syncProgress();
    this.processQueue();
  }

  // The entire restart-resume mechanism: nothing about the queue is persisted,
  // so what a killed app still owes is whatever the persisted store references
  // and the cache doesn't hold. Deliberately not limited to "auto" collections —
  // a manually saved album needs its cover just as much.
  //
  // Track covers are walked as well as collection covers, because the two don't
  // overlap: `cacheArtworkForTracks` fetches a *track-level* cover for every
  // track whose album isn't a registered collection (a saved playlist's members,
  // a standalone track, a podcast episode), and a collection-only backfill would
  // never re-derive those — killing the app mid-playlist-save would strand them
  // on the fallback icon permanently. A track whose cover is aliased onto
  // another is already covered by whichever entry owns that alias target.
  backfill(): void {
    if (!getIsEffectivelyOnline()) return;
    const offlineStore = useOffline.getState();
    for (const collection of Object.values(
      offlineStore.downloadedCollections,
    )) {
      this.enqueue(collection.coverArt);
    }
    // The queue is persisted too, and its tracks were enqueued for artwork by an
    // in-memory call this restart never made.
    const tracks = [
      ...offlineStore.getDownloadedTracksList(),
      ...offlineStore.downloadQueue,
    ];
    for (const track of tracks) {
      if (!track.coverArt) continue;
      if (offlineStore.artworkAliases[artworkCacheKey(track.coverArt)])
        continue;
      this.enqueue(track.coverArt);
    }
  }

  // App start / foreground / reconnection. Gives artwork one more chance per
  // entry: the certificate may have been trusted since the block. Still
  // untrusted just re-blocks on the first cover, which costs one failed
  // handshake rather than the whole backfill.
  resume(): void {
    this.trustBlocked = false;
    this.backfill();
    this.processQueue();
  }

  // Server switch / logout / downloads cleared: drop in-flight work. `active`
  // is intentionally left alone — the in-flight `.then` handlers still run and
  // decrement it, so zeroing it here would drive it negative.
  reset(): void {
    this.generation++;
    this.queue = [];
    this.pending.clear();
    this.attempts.clear();
    this.trustBlocked = false;
    this.syncProgress();
  }

  // Drops cached covers nothing references any more — their collection or
  // track was removed locally, or deleted server-side and reconciled by the
  // crawl — then the aliases that pointed at them.
  pruneOrphaned(): void {
    const offlineStore = useOffline.getState();
    // Queued tracks count as referenced: a cover is fetched (small, 4 wide) long
    // before its audio lands, so between the two a track holds a cached cover
    // while absent from `downloadedTracks`. A prune firing in that window — the
    // end of a sync pass, a disable sweep, removing some *other* collection —
    // would otherwise delete a cover the save still needs.
    const referenced = referencedArtworkIds(
      Object.values(offlineStore.downloadedCollections),
      [
        ...offlineStore.getDownloadedTracksList(),
        ...offlineStore.downloadQueue,
      ],
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
    // Covers still queued count as present: their aliases are already written
    // and their files are moments away.
    useOffline.getState().pruneArtworkAliases(this.pending);
  }

  private dir(): Directory {
    return internalArtworkDirectory();
  }

  private syncProgress(): void {
    const pending = this.queue.length + this.active;
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
  }

  private processQueue(): void {
    const { downloadsWifiOnly } = useAppBase.getState();
    if (downloadsWifiOnly && getConnectionType() !== "wifi") return;
    if (this.trustBlocked) return;
    while (this.active < ARTWORK_CONCURRENCY) {
      const coverArt = this.queue.shift();
      if (!coverArt) return;
      const generation = this.generation;
      this.active++;
      void this.downloadOne(coverArt, generation).then((ok) => {
        this.active--;
        const key = artworkCacheKey(coverArt);
        // An untrusted certificate blocks every cover on this host equally, so
        // abandon the burst instead of re-queueing each one until it exhausts
        // its attempts. Covers already on disk stay; the rest wait for a
        // resume().
        if (this.trustBlocked) {
          this.queue = [];
          this.pending.clear();
          this.attempts.clear();
          this.syncProgress();
          return;
        }
        const attempts = (this.attempts.get(key) ?? 0) + 1;
        if (
          !ok &&
          generation === this.generation &&
          attempts < ARTWORK_ATTEMPTS
        ) {
          this.attempts.set(key, attempts);
          this.queue.push(coverArt);
        } else {
          this.attempts.delete(key);
          this.pending.delete(key);
        }
        this.syncProgress();
        this.processQueue();
      });
    }
  }

  // Resolves true when the cover is on disk (or the attempt is moot), false
  // when it should be retried.
  private async downloadOne(
    coverArt: string,
    generation: number,
  ): Promise<boolean> {
    try {
      const { serverId, username } = useAuthBase.getState();
      if (!serverId || !username) return true;
      const dir = this.dir();
      dir.create({ idempotent: true, intermediates: true });
      // Timestamped filename: a refreshed cover must get a NEW file:// URI,
      // else expo-image's URI-keyed cache keeps showing the old bytes.
      const key = artworkCacheKey(coverArt);
      const fileName = `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}_${Date.now()}.jpg`;
      const previous = useOffline.getState().artworkCache[key];
      const source = artworkUrl(coverArt, ARTWORK_SIZE);
      const result = await File.downloadFileAsync(
        source,
        new File(dir, fileName),
        { idempotent: true, headers: requestHeadersForUrl(source) },
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
      // An untrusted server certificate is not a per-cover failure: it fails the
      // handshake for every cover on this host. Flag it so processQueue
      // abandons the burst rather than logging one line per cover forever.
      if (isTlsTrustFailure(error)) {
        // A cover still in flight against the previous server must not block
        // the incoming one — nothing but reset()/resume() clears this.
        if (generation !== this.generation) return true;
        this.trustBlocked = true;
        if (__DEV__) {
          console.log(
            "Artwork cache: paused — the server's certificate isn't trusted",
          );
        }
        return false;
      }
      // Artwork is decorative — a failure is retried in-burst and then on the
      // next backfill, never surfaced as a sync error.
      if (__DEV__) {
        console.log(`Artwork cache: ${coverArt} download failed`, error);
      }
      return false;
    }
  }
}

export const artworkCacheService = ArtworkCacheService.getInstance();

// The one rule every download entry point applies, so a saved track keeps its
// artwork offline whichever screen saved it: one cover per album, with every
// member track's cover id aliased onto it. `planTrackArtwork` owns which cover
// that is and why.
//
// Aliases are written in one batch: they land in the persisted store, and a
// write per track would re-serialize it once per song of a bulk save.
export function cacheArtworkForTracks(songs: Child[]): void {
  if (songs.length === 0) return;
  const { downloadedCollections, artworkAliases } = useOffline.getState();
  const { aliases, covers } = planTrackArtwork(
    songs,
    downloadedCollections,
    artworkAliases,
  );
  if (Object.keys(aliases).length > 0) {
    useOffline.getState().addArtworkAliases(aliases);
  }
  for (const coverArt of covers) {
    artworkCacheService.enqueue(coverArt);
  }
}
