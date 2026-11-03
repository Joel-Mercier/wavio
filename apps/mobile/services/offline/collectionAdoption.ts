import { queryClient } from "@/config/queryClient";
import { getAlbum } from "@/services/backend/browsing";
import { getPlaylist } from "@/services/backend/playlists";
import { getIsEffectivelyOnline } from "@/services/network";
import {
  artworkCacheService,
  cacheArtworkForTracks,
} from "@/services/offline/artworkCacheService";
import {
  isUserOwned,
  userOwnedTracks,
} from "@/services/offline/autoDownloadPlan";
import { offlineDownloadService } from "@/services/offline/downloadService";
import type {
  AlbumID3,
  Child,
  Playlist,
  Playlists,
  Starred2,
} from "@/services/openSubsonic/types";
import { currentAuthScope } from "@/stores/auth";
import useLibrarySync from "@/stores/librarySync";
import useOffline, {
  type IncompleteCollection,
  type OfflineCollection,
  type OfflineStore,
} from "@/stores/offline";
import usePlaylistsStore from "@/stores/playlists";
import { logError } from "@/utils/log";

// Registers playlists and starred albums whose every track is already on disk
// (typically because a larger saved collection covers them) as downloaded
// collections, so they are listed and playable offline without having been
// opened first (issue #239). Opening one already did this through
// useCollectionDownload's heal effect; this runs the same registration from the
// listings the Library is built from.

type Kind = OfflineCollection["kind"];
type CollectionMeta = Omit<
  OfflineCollection,
  "trackIds" | "songCount" | "savedAt" | "source" | "ruleVersion"
>;
export type Membership<T> = { item: T; meta: CollectionMeta; entries: Child[] };

type Source<T extends { id: string; songCount: number }> = {
  // `mayBeComplete` is a cheap pre-check against the downloads, so only
  // collections that can be complete ever cost a request. `version` changes
  // whenever the membership may have.
  prepare: (tracks: OfflineStore["downloadedTracks"]) => {
    mayBeComplete: (item: T) => boolean;
    version: (item: T) => string;
  };
  load: (id: string) => Promise<Membership<T> | null>;
};

const playlists: Source<Playlist> = {
  prepare: (tracks) => {
    const downloadedCount = Object.keys(tracks).length;
    return {
      mayBeComplete: (playlist) =>
        playlist.songCount <= downloadedCount &&
        !usePlaylistsStore.getState().deletedPlaylists[playlist.id],
      version: (playlist) =>
        `${String(playlist.changed)}|${playlist.songCount}`,
    };
  },
  load: async (id) => {
    const playlist = (await getPlaylist(id))?.playlist;
    if (!playlist) return null;
    return {
      item: playlist,
      meta: {
        id,
        kind: "playlist",
        name: playlist.name,
        coverArt: playlist.coverArt,
        owner: playlist.owner,
      },
      entries: playlist.entry ?? [],
    };
  },
};

const albums: Source<AlbumID3> = {
  // Downloads made before `albumId` was recorded don't count, so an album
  // covered only by those is missed rather than fetched on every listing. The
  // count is part of the version so a track whose id the server changed is
  // re-checked once its replacement is downloaded.
  prepare: (tracks) => {
    const perAlbum = new Map<string, number>();
    for (const track of Object.values(tracks)) {
      if (track.albumId) {
        perAlbum.set(track.albumId, (perAlbum.get(track.albumId) ?? 0) + 1);
      }
    }
    return {
      mayBeComplete: (album) =>
        (perAlbum.get(album.id) ?? 0) >= album.songCount,
      version: (album) => `${album.songCount}|${perAlbum.get(album.id) ?? 0}`,
    };
  },
  load: async (id) => {
    const album = (await getAlbum(id))?.album;
    if (!album) return null;
    return {
      item: album,
      meta: {
        id,
        kind: "album",
        name: album.name,
        coverArt: album.coverArt,
        artist: album.artist,
        artistId: album.artistId,
        artists: album.artists,
        year: album.year,
      },
      entries: album.song ?? [],
    };
  },
};

// The library sync registers every album and playlist itself, as "auto"
// content, and the liked-albums and playlists automatic downloads theirs as
// "rule" content; a "user" entry written here first would outrank theirs and
// survive the user switching them off (or unliking the album). Re-checked
// after each fetch, since either can be turned on while one is in flight.
function ruleOwns(kind: Kind): boolean {
  const state = useOffline.getState();
  return kind === "album"
    ? state.autoDownloadLikedAlbums
    : state.autoDownloadPlaylists;
}

function canRegister(kind: Kind, id: string, scope: string): boolean {
  return (
    !useLibrarySync.getState().extendedOfflineModeEnabled &&
    !ruleOwns(kind) &&
    scope === currentAuthScope() &&
    !(id in useOffline.getState().downloadedCollections) &&
    !offlineDownloadService.isRemovingCollection(id)
  );
}

function isStillIncomplete(
  known: IncompleteCollection | undefined,
  version: string,
): boolean {
  return (
    known?.version === version &&
    !isUserOwned(useOffline.getState().downloadedTracks[known.missingTrackId])
  );
}

async function adopt<T extends { id: string; songCount: number }>(
  kind: Kind,
  source: Source<T>,
  items: T[],
): Promise<void> {
  if (useLibrarySync.getState().extendedOfflineModeEnabled) return;
  if (ruleOwns(kind)) return;
  const { incompleteCollections } = useOffline.getState();
  const downloadedTracks = userOwnedTracks(
    useOffline.getState().downloadedTracks,
  );
  if (Object.keys(downloadedTracks).length === 0) return;
  const scope = currentAuthScope();
  const { mayBeComplete, version } = source.prepare(downloadedTracks);
  const checked: Record<string, IncompleteCollection | null> = {};

  try {
    for (const item of items) {
      if (!getIsEffectivelyOnline()) break;
      if (
        item.songCount <= 0 ||
        !mayBeComplete(item) ||
        !canRegister(kind, item.id, scope)
      ) {
        continue;
      }
      const key = `${kind}|${item.id}`;
      if (isStillIncomplete(incompleteCollections[key], version(item))) {
        continue;
      }
      try {
        const membership = await source.load(item.id);
        if (!membership?.entries.length || !canRegister(kind, item.id, scope)) {
          continue;
        }
        const { entries, meta } = membership;
        const { downloadedTracks: current } = useOffline.getState();
        const missing = entries.find((song) => !isUserOwned(current[song.id]));
        if (missing) {
          // From the fetch, not the listing: fetching a smart playlist makes
          // Navidrome re-evaluate it, which moves `changed` past the listing's.
          checked[key] = {
            version: version(membership.item),
            missingTrackId: missing.id,
          };
          continue;
        }
        if (incompleteCollections[key]) checked[key] = null;
        useOffline.getState().addDownloadedCollection({
          ...meta,
          trackIds: entries.map((song) => song.id),
          songCount: entries.length,
          savedAt: new Date().toISOString(),
        });
        artworkCacheService.enqueue(meta.coverArt);
        cacheArtworkForTracks(entries);
      } catch (error) {
        logError(`Error checking ${kind} ${item.id} for downloads:`, error);
      }
    }
  } finally {
    if (scope === currentAuthScope() && Object.keys(checked).length > 0) {
      useOffline.getState().updateIncompleteCollections(checked);
    }
  }
}

// Coalesces overlapping triggers: a listing that arrives mid-run is checked
// once the current run ends, and only the latest one per kind.
let running = false;
const pending: { playlist?: Playlist[]; album?: AlbumID3[] } = {};

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (pending.playlist || pending.album) {
      const { playlist, album } = pending;
      pending.playlist = undefined;
      pending.album = undefined;
      if (playlist) await adopt("playlist", playlists, playlist);
      if (album) await adopt("album", albums, album);
    }
  } finally {
    running = false;
  }
}

export function adoptDownloadedPlaylists(items: Playlist[]): Promise<void> {
  pending.playlist = items;
  return drain();
}

export function adoptDownloadedAlbums(items: AlbumID3[]): Promise<void> {
  pending.album = items;
  return drain();
}

function cachedListings() {
  // The freshest listing wins: an older one (another user filter, restored from
  // the persisted cache) carries a stale `changed`, which never matches the
  // recorded incomplete version and refetches the playlist after every drain.
  const listings = queryClient
    .getQueryCache()
    .findAll({ queryKey: ["playlists"] })
    .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);
  const byId = new Map<string, Playlist>();
  for (const query of listings) {
    const data = query.state.data as { playlists?: Playlists } | undefined;
    for (const playlist of data?.playlists?.playlist ?? []) {
      byId.set(playlist.id, playlist);
    }
  }
  const starred = queryClient.getQueryData<{ starred2?: Starred2 }>([
    "starred2",
  ]);
  return {
    playlists: [...byId.values()],
    albums: starred?.starred2?.album ?? [],
  };
}

// A drain that just finished may have completed collections the last listing
// checked while their tracks were still queued.
export function subscribeCollectionAdoption(): () => void {
  return useOffline.subscribe((state, prev) => {
    if (prev.downloadQueue.length > 0 && state.downloadQueue.length === 0) {
      const listings = cachedListings();
      pending.playlist = listings.playlists;
      pending.album = listings.albums;
      void drain();
    }
  });
}

export function __resetCollectionAdoption(): void {
  running = false;
  pending.playlist = undefined;
  pending.album = undefined;
}

// Shared with the automatic downloads, which fetch the same memberships.
export const loadAlbumMembership = albums.load;
export const loadPlaylistMembership = playlists.load;
