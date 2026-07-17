import type {
  AlbumWithSongsID3,
  Child,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";

// Reconstruct Subsonic-shaped data from the (per-server-scoped) offline store so
// downloaded playlist/album screens render and play with no server or React
// Query cache — e.g. after a logout that clears the persisted cache. Everything
// here reads only the data it's handed from the active scope's offline store, so
// it never bleeds content between servers.

// The single definition of "which tracks are protected by a collection" —
// used by removeCollection, removeAutoContent and planServerDeletions so
// deletion paths can't drift apart. Callers pass the collections that count as
// protective (e.g. all but the one being removed, or only user-saved ones).
export function trackIdsReferencedByCollections(
  collections: Iterable<OfflineCollection>,
): Set<string> {
  const referenced = new Set<string>();
  for (const collection of collections) {
    for (const trackId of collection.trackIds) {
      referenced.add(trackId);
    }
  }
  return referenced;
}

// Whether an album collection belongs to `artistId` — the single definition of
// artist credit used by every offline-artist derivation. A multi-artist album
// counts for its primary artistId AND every credited artist in `artists`.
export function collectionCreditsArtist(
  collection: OfflineCollection,
  artistId: string,
): boolean {
  if (collection.kind !== "album") return false;
  return (
    collection.artistId === artistId ||
    (collection.artists ?? []).some((artist) => artist.id === artistId)
  );
}

// The credited artists of an album collection as id/name pairs (primary first,
// deduped) for enumerating offline artists.
export function collectionArtistCredits(
  collection: OfflineCollection,
): { id: string; name: string }[] {
  if (collection.kind !== "album") return [];
  const credits: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  if (collection.artistId) {
    credits.push({ id: collection.artistId, name: collection.artist ?? "" });
    seen.add(collection.artistId);
  }
  for (const artist of collection.artists ?? []) {
    if (seen.has(artist.id)) continue;
    seen.add(artist.id);
    credits.push(artist);
  }
  return credits;
}

export function offlineTrackToChild(track: OfflineTrack): Child {
  return {
    id: track.id,
    isDir: false,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverArt: track.coverArt,
    duration: track.duration,
    size: track.size,
    suffix: track.path.split(".").pop(),
    track: track.track,
    discNumber: track.discNumber,
  };
}

function collectionTracks(
  collection: OfflineCollection,
  downloadedTracks: Record<string, OfflineTrack>,
): Child[] {
  return collection.trackIds
    .map((trackId) => downloadedTracks[trackId])
    .filter((track): track is OfflineTrack => Boolean(track))
    .map(offlineTrackToChild);
}

export function offlineCollectionToPlaylist(
  collection: OfflineCollection,
  downloadedTracks: Record<string, OfflineTrack>,
): PlaylistWithSongs {
  const entry = collectionTracks(collection, downloadedTracks);
  const savedAt = new Date(collection.savedAt);
  return {
    id: collection.id,
    name: collection.name,
    coverArt: collection.coverArt,
    owner: collection.owner,
    songCount: collection.songCount,
    duration: entry.reduce((total, track) => total + (track.duration ?? 0), 0),
    changed: savedAt,
    created: savedAt,
    entry,
  };
}

export function offlineCollectionToAlbum(
  collection: OfflineCollection,
  downloadedTracks: Record<string, OfflineTrack>,
): AlbumWithSongsID3 {
  // The library sync appends trackIds in crawl order, not album order. Sorting
  // by disc/track restores it; tracks downloaded before those fields existed
  // all compare equal, so their saved order is kept (stable sort).
  const song = collectionTracks(collection, downloadedTracks).sort(
    (a, b) =>
      (a.discNumber ?? 0) - (b.discNumber ?? 0) ||
      (a.track ?? 0) - (b.track ?? 0),
  );
  return {
    id: collection.id,
    name: collection.name,
    coverArt: collection.coverArt,
    artist: collection.artist,
    artistId: collection.artistId,
    artists: collection.artists,
    year: collection.year,
    songCount: collection.songCount,
    duration: song.reduce((total, track) => total + (track.duration ?? 0), 0),
    created: new Date(collection.savedAt),
    song,
  };
}
