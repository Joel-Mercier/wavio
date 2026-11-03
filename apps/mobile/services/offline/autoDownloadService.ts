import { getCapabilities } from "@/services/backend/capabilities";
import { getStarred2 } from "@/services/backend/lists";
import { getPlaylists } from "@/services/backend/playlists";
import { backgroundSleep } from "@/services/backgroundTimer";
import { getPlaylistsByOwner } from "@/services/navidrome/playlists";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  artworkCacheService,
  cacheArtworkForTracks,
} from "@/services/offline/artworkCacheService";
import {
  type AutoDownloadRules,
  albumRuleVersion,
  isExcluded,
  isOwnPlaylist,
  isPlaylistIncluded,
  isReleasePlanEmpty,
  isSmartPlaylist,
  needsCollectionFetch,
  outranks,
  planAutoDownloadRelease,
  playlistRuleVersion,
  rulesOf,
} from "@/services/offline/autoDownloadPlan";
import { setAutoDownloadSyncHandler } from "@/services/offline/autoDownloadTrigger";
import {
  loadAlbumMembership,
  loadPlaylistMembership,
} from "@/services/offline/collectionAdoption";
import { registerCollection } from "@/services/offline/collectionSave";
import {
  type DeleteProgress,
  offlineDownloadService,
} from "@/services/offline/downloadService";
import type { AlbumID3, Child, Playlist } from "@/services/openSubsonic/types";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import { isIdMigrationFrozen, useLibrarySyncBase } from "@/stores/librarySync";
import useOffline, {
  type AutoDownloadKind,
  type OfflineCollection,
} from "@/stores/offline";
import { logError } from "@/utils/log";

export type AutoDownloadRule = keyof AutoDownloadRules;

// Foreground and queue-drain nudges don't re-list the server more often than
// this; a like, a playlist edit, a reconnect or switching a rule on always does.
const LISTING_INTERVAL_MS = 60_000;
// A listing that suddenly comes back empty is asked again before it is
// believed: a server answering empty while it warms up would otherwise read as
// "everything was unliked" and delete every automatic download.
const EMPTY_LISTING_RECHECK_MS = 5_000;

type Listings = {
  likedSongs: Child[] | null;
  likedAlbums: AlbumID3[] | null;
  playlists: Playlist[] | null;
};

type ListedIds = {
  likedAlbumIds: ReadonlySet<string> | null;
  playlistIds: ReadonlySet<string> | null;
};

const NOT_LISTED: ListedIds = { likedAlbumIds: null, playlistIds: null };

/**
 * The user's own playlists and which of them are smart. Navidrome's native API
 * is the authoritative source for the latter; anywhere else (or when it fails)
 * OpenSubsonic's `validUntil`, only ever set on a smart playlist, stands in.
 */
export async function fetchOwnPlaylists(): Promise<{
  playlists: Playlist[];
  smartIds: Set<string>;
}> {
  const res = await getPlaylists({});
  const { username } = useAuthBase.getState();
  const playlists = (res.playlists?.playlist ?? []).filter((playlist) =>
    isOwnPlaylist(playlist, username ?? ""),
  );
  return { playlists, smartIds: await navidromeSmartPlaylistIds() };
}

async function navidromeSmartPlaylistIds(): Promise<Set<string>> {
  const { serverType, userId } = useAuthBase.getState();
  if (serverType !== "navidrome" || !userId) return new Set();
  try {
    const playlists = await getPlaylistsByOwner(userId);
    return new Set(
      playlists
        .filter((playlist) => !!playlist.rules)
        .map((playlist) => playlist.id),
    );
  } catch {
    return new Set();
  }
}

function sameIds(a: string[] | null, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function holdsRuleCollections(kind: OfflineCollection["kind"]): boolean {
  return Object.values(useOffline.getState().downloadedCollections).some(
    (collection) => collection.source === "rule" && collection.kind === kind,
  );
}

// Keeps the liked songs, liked albums and the user's playlists downloaded
// ("Automatic downloads" in the settings). It works from the difference between
// what the enabled rules want and what they hold, so one pass covers a like,
// an unlike, a playlist edit, an exclusion and a rule switched off alike:
//
//   - everything wanted is registered as "rule" content and queued;
//   - "rule" content nothing wants any more is released — deleted, or handed
//     to the library sync as "auto" content while that is on, so switching a
//     rule off never deletes what the whole-library cache still keeps.
//
// Only a fresh, successful listing may release something because the server no
// longer has it. Without one (offline, between listings) only what the user
// did locally — a rule switched off, an item excluded — is acted on.
export class AutoDownloadService {
  private static instance: AutoDownloadService;
  // Bumped on scope switch and on every rule change, so a pass in flight stops
  // at its next step instead of acting on a state that no longer holds.
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private scheduled: Promise<void> | null = null;
  private forceNext = false;
  private lastListedAt = 0;

  private constructor() {
    setAutoDownloadSyncHandler(() => {
      void this.kick({ force: true });
    });
    subscribeEffectiveOnline(() => {
      if (getIsEffectivelyOnline()) void this.kick({ force: true });
    });
    // A download still in flight when its rule let go lands as "rule" content
    // nothing wants; the drain is when it can be released.
    useOffline.subscribe((state, prev) => {
      if (prev.downloadQueue.length > 0 && state.downloadQueue.length === 0) {
        void this.kick();
      }
    });
  }

  static getInstance(): AutoDownloadService {
    if (!AutoDownloadService.instance) {
      AutoDownloadService.instance = new AutoDownloadService();
    }
    return AutoDownloadService.instance;
  }

  // Resolves once the pass it scheduled (or joined) is done; never rejects, a
  // failed pass is logged.
  kick(opts: { force?: boolean } = {}): Promise<void> {
    if (opts.force) this.forceNext = true;
    if (this.scheduled) return this.scheduled;
    this.scheduled = this.serial(async () => {
      this.scheduled = null;
      const force = this.forceNext;
      this.forceNext = false;
      await this.run(force);
    }).catch(() => {});
    return this.scheduled;
  }

  reset(): void {
    this.generation++;
    this.lastListedAt = 0;
  }

  // Switching a rule off releases what it held right away (with progress, for
  // the settings dialog); switching one on lists the server immediately.
  async setRuleEnabled(
    rule: AutoDownloadRule,
    enabled: boolean,
    onProgress?: DeleteProgress,
  ): Promise<void> {
    const state = useOffline.getState();
    if (rule === "likedSongs") {
      state.setOfflineModeEnabled(enabled);
      // A snapshot from before the rule was off could be stale by the time it
      // is back on; with none, nothing is released until a fresh listing.
      if (!enabled) state.setLikedSongIds(null);
    } else if (rule === "likedAlbums") {
      state.setAutoDownloadLikedAlbums(enabled);
    } else {
      state.setAutoDownloadPlaylists(enabled);
    }
    this.generation++;
    if (enabled) {
      await this.kick({ force: true });
      return;
    }
    await this.serial(() => this.release(NOT_LISTED, onProgress));
  }

  // Whether switching the rule off would delete anything, so the settings
  // screen only asks for confirmation when it would. Nothing is deleted while
  // the library sync is on: it takes the downloads over.
  holdsContent(rule: AutoDownloadRule): boolean {
    if (useLibrarySyncBase.getState().extendedOfflineModeEnabled) return false;
    const state = useOffline.getState();
    return !isReleasePlanEmpty(
      planAutoDownloadRelease({
        collections: state.downloadedCollections,
        tracks: state.downloadedTracks,
        queue: state.downloadQueue,
        rules: { ...this.activeRules(), [rule]: false },
        overrides: state.autoDownloadOverrides,
        likedSongIds: state.likedSongIds,
        ...NOT_LISTED,
      }),
    );
  }

  // Lifts exclusions from the settings sheet. A song comes back through
  // whichever album or playlist lists it, so those are refetched.
  includeAgain(keys: string[]): Promise<void> {
    const state = useOffline.getState();
    const updates: Record<string, null> = {};
    for (const key of keys) updates[key] = null;
    state.updateAutoDownloadOverrides(updates);
    if (keys.some((key) => key.startsWith("song:"))) {
      const stale = Object.values(state.downloadedCollections)
        .filter((collection) => collection.source === "rule")
        .map((collection) => ({ ...collection, ruleVersion: undefined }));
      if (stale.length > 0) state.addDownloadedCollections(stale);
    }
    return this.kick({ force: true });
  }

  // Excludes or re-includes one playlist from the playlists rule (the settings
  // sheet's per-playlist switches). The override is dropped when the choice
  // matches the default for that playlist.
  setPlaylistIncluded(
    playlist: Playlist,
    smart: boolean,
    included: boolean,
  ): Promise<void> {
    const key = `playlist:${playlist.id}`;
    useOffline.getState().updateAutoDownloadOverrides({
      [key]:
        included === !smart
          ? null
          : {
              mode: included ? "include" : "exclude",
              kind: "playlist",
              name: playlist.name,
            },
    });
    this.generation++;
    return this.kick({ force: true });
  }

  private serial(task: () => Promise<void>): Promise<void> {
    const next = this.tail.then(task);
    this.tail = next.catch((error) => {
      logError("Automatic downloads: pass failed:", error);
    });
    return next;
  }

  private isCurrent(generation: number, scope: string): boolean {
    return generation === this.generation && scope === currentAuthScope();
  }

  private hasSession(): boolean {
    const { url, username } = useAuthBase.getState();
    return !!url && !!username && useOffline.persist.hasHydrated();
  }

  // Albums and playlists only download where the backend serves downloadable
  // files; liked songs keep the reach they always had.
  private activeRules(): AutoDownloadRules {
    const rules = rulesOf(useOffline.getState());
    if (getCapabilities(useAuthBase.getState().serverType).offlineDownload) {
      return rules;
    }
    return { ...rules, likedAlbums: false, playlists: false };
  }

  private async run(force: boolean): Promise<void> {
    if (!this.hasSession()) return;
    const generation = this.generation;
    const scope = currentAuthScope();
    await this.release(NOT_LISTED);
    if (!this.isCurrent(generation, scope)) return;
    const rules = this.activeRules();
    if (!rules.likedSongs && !rules.likedAlbums && !rules.playlists) return;
    // A pending canonical-id migration renumbers ids server-side: a listing
    // taken now would read every downloaded id as unliked or removed.
    if (!getIsEffectivelyOnline() || isIdMigrationFrozen()) return;
    if (!force && Date.now() - this.lastListedAt < LISTING_INTERVAL_MS) return;
    this.lastListedAt = Date.now();

    let listings: Listings | null;
    try {
      listings = await this.fetchListings(rules, generation, scope);
    } catch (error) {
      this.lastListedAt = 0;
      logError("Automatic downloads: listing failed:", error);
      return;
    }
    if (!listings || !this.isCurrent(generation, scope)) return;

    if (listings.likedSongs) this.applyLikedSongs(listings.likedSongs);
    if (listings.likedAlbums) {
      await this.applyCollections(
        "album",
        listings.likedAlbums,
        albumRuleVersion,
        generation,
        scope,
      );
    }
    if (listings.playlists) {
      await this.applyCollections(
        "playlist",
        listings.playlists,
        playlistRuleVersion,
        generation,
        scope,
      );
    }
    if (!this.isCurrent(generation, scope)) return;
    await this.release({
      likedAlbumIds: listings.likedAlbums
        ? new Set(listings.likedAlbums.map((album) => album.id))
        : null,
      playlistIds: listings.playlists
        ? new Set(listings.playlists.map((playlist) => playlist.id))
        : null,
    });
  }

  private async fetchListings(
    rules: AutoDownloadRules,
    generation: number,
    scope: string,
  ): Promise<Listings | null> {
    const listings: Listings = {
      likedSongs: null,
      likedAlbums: null,
      playlists: null,
    };

    if (rules.likedSongs || rules.likedAlbums) {
      const listStarred = async () => (await getStarred2()).starred2;
      let starred = await listStarred();
      const suspicious =
        (rules.likedSongs &&
          !starred?.song?.length &&
          !!useOffline.getState().likedSongIds?.length) ||
        (rules.likedAlbums &&
          !starred?.album?.length &&
          holdsRuleCollections("album"));
      if (suspicious) {
        await backgroundSleep(EMPTY_LISTING_RECHECK_MS);
        if (!this.isCurrent(generation, scope)) return null;
        starred = await listStarred();
      }
      if (rules.likedSongs) listings.likedSongs = starred?.song ?? [];
      if (rules.likedAlbums) listings.likedAlbums = starred?.album ?? [];
    }

    if (rules.playlists) {
      let own = await fetchOwnPlaylists();
      if (own.playlists.length === 0 && holdsRuleCollections("playlist")) {
        await backgroundSleep(EMPTY_LISTING_RECHECK_MS);
        if (!this.isCurrent(generation, scope)) return null;
        own = await fetchOwnPlaylists();
      }
      const { autoDownloadOverrides } = useOffline.getState();
      listings.playlists = own.playlists.filter((playlist) =>
        isPlaylistIncluded(
          autoDownloadOverrides,
          playlist,
          isSmartPlaylist(playlist, own.smartIds),
        ),
      );
    }

    return listings;
  }

  private applyLikedSongs(songs: Child[]): void {
    const state = useOffline.getState();
    const ids = songs.map((song) => song.id);
    if (!sameIds(state.likedSongIds, ids)) state.setLikedSongIds(ids);
    const wanted = songs.filter(
      (song) => !isExcluded(state.autoDownloadOverrides, "song", song.id),
    );
    cacheArtworkForTracks(
      wanted.filter((song) => !(song.id in state.downloadedTracks)),
    );
    offlineDownloadService.enqueueTracks(wanted, "rule");
  }

  private ruleOn(kind: OfflineCollection["kind"]): boolean {
    const rules = this.activeRules();
    return kind === "album" ? rules.likedAlbums : rules.playlists;
  }

  // One request per album or playlist that changed since it was last fetched
  // (or never was), one at a time.
  private async applyCollections<T extends AlbumID3 | Playlist>(
    kind: OfflineCollection["kind"],
    items: T[],
    versionOf: (item: T) => string,
    generation: number,
    scope: string,
  ): Promise<void> {
    const queuedIds = new Set(
      useOffline.getState().downloadQueue.map((queued) => queued.id),
    );
    for (const item of items) {
      if (!this.isCurrent(generation, scope) || !this.ruleOn(kind)) return;
      const state = useOffline.getState();
      if (isExcluded(state.autoDownloadOverrides, kind, item.id)) continue;
      const version = versionOf(item);
      if (
        !needsCollectionFetch(
          state.downloadedCollections[item.id],
          item.songCount,
          version,
          state.downloadedTracks,
          queuedIds,
        )
      ) {
        continue;
      }
      try {
        const membership =
          kind === "album"
            ? await loadAlbumMembership(item.id)
            : await loadPlaylistMembership(item.id);
        if (!this.isCurrent(generation, scope) || !this.ruleOn(kind)) return;
        if (membership) this.writeCollection(kind, membership, version);
      } catch (error) {
        logError(
          `Automatic downloads: error fetching ${kind} ${item.id}:`,
          error,
        );
      }
    }
  }

  private writeCollection(
    kind: AutoDownloadKind,
    membership: NonNullable<Awaited<ReturnType<typeof loadAlbumMembership>>>,
    version: string,
  ): void {
    const { meta } = membership;
    const state = useOffline.getState();
    const existing = state.downloadedCollections[meta.id];
    // Re-checked after the fetch: the user may have saved, removed or excluded
    // it while the request was out.
    if (existing && existing.source !== "rule") {
      if (!outranks("rule", existing.source)) return;
    }
    if (offlineDownloadService.isRemovingCollection(meta.id)) return;
    if (isExcluded(state.autoDownloadOverrides, kind, meta.id)) return;
    const entries = membership.entries.filter(
      (entry) => !isExcluded(state.autoDownloadOverrides, "song", entry.id),
    );
    // An emptied playlist is still written, so the release that follows deletes
    // the tracks it no longer lists.
    if (entries.length === 0 && existing?.source !== "rule") return;
    registerCollection(meta, entries, {
      source: "rule",
      ruleVersion: version,
      ...(existing ? { savedAt: existing.savedAt } : {}),
    });
    offlineDownloadService.enqueueTracks(entries, "rule");
  }

  private async release(
    listed: ListedIds,
    onProgress?: DeleteProgress,
  ): Promise<void> {
    if (!useOffline.persist.hasHydrated()) return;
    const state = useOffline.getState();
    const plan = planAutoDownloadRelease({
      collections: state.downloadedCollections,
      tracks: state.downloadedTracks,
      queue: state.downloadQueue,
      rules: this.activeRules(),
      overrides: state.autoDownloadOverrides,
      likedSongIds: state.likedSongIds,
      ...listed,
    });
    if (isReleasePlanEmpty(plan)) return;
    if (__DEV__) {
      console.log("[autoDownloads] release", {
        collections: plan.collectionIds.length,
        tracks: plan.trackIds.length,
        queued: plan.queuedIds.length,
      });
    }

    if (useLibrarySyncBase.getState().extendedOfflineModeEnabled) {
      state.addDownloadedCollections(
        plan.collectionIds.map((id) => ({
          ...state.downloadedCollections[id],
          source: "auto",
          ruleVersion: undefined,
        })),
      );
      state.addDownloadedTracks(
        plan.trackIds.map((id) => ({
          ...state.downloadedTracks[id],
          source: "auto",
        })),
      );
      state.setQueuedTracksSource(plan.queuedIds, "auto");
      return;
    }

    state.removeDownloadedCollections(plan.collectionIds);
    offlineDownloadService.cancelQueuedTracks(plan.queuedIds);
    await offlineDownloadService.removeDownloadedTracks(
      plan.trackIds,
      onProgress,
    );
    artworkCacheService.pruneOrphaned();
  }
}

export const autoDownloadService = AutoDownloadService.getInstance();
