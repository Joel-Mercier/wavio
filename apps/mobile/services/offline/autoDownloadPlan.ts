import { trackIdsReferencedByCollections } from "@/services/offline/collections";
import type { AlbumID3, Playlist } from "@/services/openSubsonic/types";
import type {
  AutoDownloadKind,
  AutoDownloadOverride,
  OfflineCollection,
  OfflineSource,
  OfflineStore,
  OfflineTrack,
  QueuedTrack,
} from "@/stores/offline";

export type AutoDownloadRules = {
  likedSongs: boolean;
  likedAlbums: boolean;
  playlists: boolean;
};

const SOURCE_RANK: Record<OfflineSource, number> = {
  auto: 0,
  rule: 1,
  user: 2,
};

export function outranks(
  source: OfflineSource,
  existing: OfflineSource | undefined,
): boolean {
  return SOURCE_RANK[source] > SOURCE_RANK[existing ?? "user"];
}

// Only what the user saved can make a collection theirs. Registering one as a
// hand save because the automatic downloads or the library sync happened to put
// all its tracks on disk would take those tracks over for good: unliking,
// opting out or switching the rule off would no longer delete them.
export function isUserOwned(track: OfflineTrack | undefined): boolean {
  return !!track && (track.source ?? "user") === "user";
}

export function userOwnedTracks(
  tracks: Record<string, OfflineTrack>,
): Record<string, OfflineTrack> {
  const owned: Record<string, OfflineTrack> = {};
  for (const [id, track] of Object.entries(tracks)) {
    if (isUserOwned(track)) owned[id] = track;
  }
  return owned;
}

export function autoDownloadKey(kind: AutoDownloadKind, id: string): string {
  return `${kind}:${id}`;
}

export function isExcluded(
  overrides: Record<string, AutoDownloadOverride>,
  kind: AutoDownloadKind,
  id: string,
): boolean {
  return overrides[autoDownloadKey(kind, id)]?.mode === "exclude";
}

export function rulesOf(
  state: Pick<
    OfflineStore,
    "offlineModeEnabled" | "autoDownloadLikedAlbums" | "autoDownloadPlaylists"
  >,
): AutoDownloadRules {
  return {
    likedSongs: state.offlineModeEnabled,
    likedAlbums: state.autoDownloadLikedAlbums,
    playlists: state.autoDownloadPlaylists,
  };
}

// A smart playlist is skipped unless the user opted it in: one sorted at random
// re-draws its members on every evaluation, and following it would download a
// fresh set each time.
export function isSmartPlaylist(
  playlist: Playlist,
  smartIds: ReadonlySet<string>,
): boolean {
  return !!playlist.validUntil || smartIds.has(playlist.id);
}

export function isPlaylistIncluded(
  overrides: Record<string, AutoDownloadOverride>,
  playlist: Playlist,
  smart: boolean,
): boolean {
  const mode = overrides[autoDownloadKey("playlist", playlist.id)]?.mode;
  if (mode) return mode === "include";
  return !smart;
}

// Subsonic lists other users' public playlists too; those are theirs to curate.
// Backends that don't report an owner (Jellyfin, the on-device library) only
// list the user's own.
export function isOwnPlaylist(playlist: Playlist, username: string): boolean {
  return (
    !playlist.owner || playlist.owner.toLowerCase() === username.toLowerCase()
  );
}

export function albumRuleVersion(album: AlbumID3): string {
  return `${album.songCount}|${album.duration ?? ""}`;
}

export function playlistRuleVersion(playlist: Playlist): string {
  return `${String(playlist.changed ?? "")}|${playlist.songCount}`;
}

// Whether an album or playlist has to be fetched to bring its automatic
// download up to date: it isn't one yet (or the library sync holds it, which
// the rule takes over), the server's version moved, or a track it lists is
// neither downloaded nor queued (a failed download, a song excluded since).
// A saved collection is the user's and is left alone, and an empty one the rule
// doesn't hold yet has nothing to download.
export function needsCollectionFetch(
  existing: OfflineCollection | undefined,
  songCount: number,
  version: string,
  downloadedTracks: Record<string, OfflineTrack>,
  queuedIds: ReadonlySet<string>,
): boolean {
  if (!existing) return songCount > 0;
  if (existing.source !== "rule") return outranks("rule", existing.source);
  if (existing.ruleVersion !== version) return true;
  return existing.trackIds.some(
    (id) => !(id in downloadedTracks) && !queuedIds.has(id),
  );
}

export function wantedLikedSongIds(
  state: Pick<
    OfflineStore,
    "offlineModeEnabled" | "likedSongIds" | "autoDownloadOverrides"
  >,
): Set<string> {
  const wanted = new Set<string>();
  if (!state.offlineModeEnabled || !state.likedSongIds) return wanted;
  for (const id of state.likedSongIds) {
    if (!isExcluded(state.autoDownloadOverrides, "song", id)) wanted.add(id);
  }
  return wanted;
}

export type AutoDownloadReleasePlan = {
  collectionIds: string[];
  trackIds: string[];
  queuedIds: string[];
};

// What the automatic downloads hold that no rule wants any more. Only "rule"
// content is ever released; a track another collection still lists (whoever
// saved it) or a song still liked stays. A null listing means the server wasn't
// asked this time, so the rule keeps everything it holds unless it was switched
// off or the item excluded. With the liked songs never listed yet there is no
// telling a liked song from a leftover, so no track is released at all.
export function planAutoDownloadRelease(args: {
  collections: Record<string, OfflineCollection>;
  tracks: Record<string, OfflineTrack>;
  queue: QueuedTrack[];
  rules: AutoDownloadRules;
  overrides: Record<string, AutoDownloadOverride>;
  likedSongIds: string[] | null;
  likedAlbumIds: ReadonlySet<string> | null;
  playlistIds: ReadonlySet<string> | null;
}): AutoDownloadReleasePlan {
  const { collections, rules, overrides } = args;
  const collectionIds: string[] = [];
  for (const collection of Object.values(collections)) {
    if (collection.source !== "rule") continue;
    const album = collection.kind === "album";
    const ruleOn = album ? rules.likedAlbums : rules.playlists;
    const listing = album ? args.likedAlbumIds : args.playlistIds;
    const wanted =
      ruleOn &&
      !isExcluded(overrides, collection.kind, collection.id) &&
      (listing === null || listing.has(collection.id));
    if (!wanted) collectionIds.push(collection.id);
  }

  if (rules.likedSongs && args.likedSongIds === null) {
    return { collectionIds, trackIds: [], queuedIds: [] };
  }

  const released = new Set(collectionIds);
  const wanted = trackIdsReferencedByCollections(
    Object.values(collections).filter(
      (collection) => !released.has(collection.id),
    ),
  );
  for (const id of wantedLikedSongIds({
    offlineModeEnabled: rules.likedSongs,
    likedSongIds: args.likedSongIds,
    autoDownloadOverrides: overrides,
  })) {
    wanted.add(id);
  }

  const trackIds = Object.values(args.tracks)
    .filter((track) => track.source === "rule" && !wanted.has(track.id))
    .map((track) => track.id);
  const queuedIds = args.queue
    .filter(
      (queued) => queued.offlineSource === "rule" && !wanted.has(queued.id),
    )
    .map((queued) => queued.id);
  return { collectionIds, trackIds, queuedIds };
}

export function isReleasePlanEmpty(plan: AutoDownloadReleasePlan): boolean {
  return (
    plan.collectionIds.length === 0 &&
    plan.trackIds.length === 0 &&
    plan.queuedIds.length === 0
  );
}
