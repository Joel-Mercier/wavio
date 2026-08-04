import { queryClient, queryPersister } from "@/config/queryClient";
import { streamUrl } from "@/services/backend/streaming";
import { offlineDownloadService } from "@/services/offline/downloadService";
import useActivity from "@/stores/activity";
import { currentAuthScope } from "@/stores/auth";
import useBookmarks from "@/stores/bookmarks";
import useLibrarySync from "@/stores/librarySync";
import useOffline from "@/stores/offline";
import useOfflineMutations from "@/stores/offlineMutations";
import usePlayHistory from "@/stores/playHistory";
import usePlaylists from "@/stores/playlists";
import useQueue, { type QueueTrack } from "@/stores/queue";
import useRadioStations from "@/stores/radioStations";
import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { artworkUrl } from "@/utils/artwork";
import { canonicalIdMap } from "@/utils/navidromeCanonicalId";

// The client half of Navidrome's canonical-id migration: rewrite every persisted
// id through the same transform the server applied to its database.
//
// This mirrors the server migration's structure deliberately — a flat inventory
// of id-bearing fields (collect/apply below), a handful of embedded values that
// need bespoke handling (stream URLs, artwork ids), and an explicit exempt set.
// Anything not listed here keeps its old id, so new persisted id fields must be
// added to BOTH collect and apply.
//
// THE ONE FIELD THAT MUST NEVER BE TRANSFORMED IS `musicBrainzId`. It is a
// 36-char UUID, indistinguishable from a legacy playlist id to the transform,
// and the server explicitly excludes every `mbz_*` column. Rewriting it would
// silently corrupt data the migration was supposed to leave alone.

type Remap = (id: string) => string;

// Cover ids are `<prefix>-<entityId>` optionally followed by `_<token>`; the
// entity id itself never contains an underscore (see utils/artworkCacheKey.ts).
const ARTWORK_ID = /^((?:al|ar|mf|pl)-)([^_]+)(_.*)?$/;

const artworkInnerId = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const match = ARTWORK_ID.exec(value);
  return match ? match[2] : null;
};

const remapArtworkId = <T extends string | undefined>(
  value: T,
  remap: Remap,
): T => {
  if (!value) return value;
  const match = ARTWORK_ID.exec(value);
  if (!match) return value;
  return `${match[1]}${remap(match[2])}${match[3] ?? ""}` as T;
};

// Radio stations and podcast episodes ride in the same queue as songs but are
// not server media: their `url` is the station's / episode's own stream URL,
// and their ids are Radio Browser / Taddy uuids — 36 chars, so the transform
// would happily rewrite them. Only a *server* radio station carries a real
// Navidrome id, and even then its stream URL must survive untouched.
const isExternalMedia = (entry: QueueTrack): boolean =>
  !!entry.isRadio || entry.source === "podcast";
const isServerRadio = (entry: QueueTrack): boolean =>
  !!entry.isRadio && entry.source === "server";

// "favorites" is a synthetic shortcut id, not a server id (9 chars, so the
// transform passes it through regardless). Radio Browser stations are keyed by
// their own uuids and belong to no server — those the transform *would*
// rewrite, into an id nothing resolves.
const isRemappableRecentPlay = (entry: RecentPlay): boolean => {
  if (entry.type === "favorites") return false;
  if (entry.type === "internetRadioStation") return entry.source === "server";
  return true;
};

const remapOptional = <T extends string | undefined>(
  value: T,
  remap: Remap,
): T => (value ? (remap(value) as T) : value);

const remapKeys = <V>(
  record: Record<string, V>,
  remap: Remap,
): Record<string, V> => {
  const out: Record<string, V> = {};
  for (const [key, value] of Object.entries(record)) out[key] = value;
  const renamed: Record<string, V> = {};
  for (const [key, value] of Object.entries(out)) renamed[remap(key)] = value;
  return renamed;
};

/**
 * Every id this app persists, gathered so the transform runs once per distinct
 * value. Kept in lockstep with applyRemap below.
 */
function collectIds(): Set<string> {
  const ids = new Set<string>();
  const add = (value: string | undefined | null) => {
    if (value) ids.add(value);
  };
  const addArtwork = (value: string | undefined | null) => {
    add(artworkInnerId(value));
  };

  const offline = useOffline.getState();
  for (const [key, track] of Object.entries(offline.downloadedTracks)) {
    add(key);
    add(track.id);
    addArtwork(track.coverArt);
  }
  for (const [key, collection] of Object.entries(
    offline.downloadedCollections,
  )) {
    add(key);
    add(collection.id);
    add(collection.artistId);
    for (const trackId of collection.trackIds) add(trackId);
    for (const artist of collection.artists ?? []) add(artist.id);
    addArtwork(collection.coverArt);
  }
  for (const queued of offline.downloadQueue) {
    add(queued.id);
    add(queued.albumId);
    add(queued.artistId);
    for (const artist of queued.artists ?? []) add(artist.id);
    addArtwork(queued.coverArt);
    // NOT queued.musicBrainzId — see the header note.
  }
  for (const key of Object.keys(offline.artworkCache)) addArtwork(key);
  for (const [from, to] of Object.entries(offline.artworkAliases)) {
    addArtwork(from);
    addArtwork(to);
  }

  const queue = useQueue.getState();
  for (const track of queue.queue) {
    if (isExternalMedia(track)) {
      if (isServerRadio(track)) add(track.id);
      continue;
    }
    add(track.id);
    add(track.albumId);
    add(track.artistId);
    addArtwork(track.coverArt);
    for (const artist of track.artists ?? []) add(artist?.id);
    // NOT track.musicBrainzId — see the header note.
  }
  for (const id of queue.originalOrderIds ?? []) add(id);
  add(queue.source?.id);
  addArtwork(queue.source?.coverArt);

  for (const entry of usePlayHistory.getState().history) {
    add(entry.id);
    add(entry.albumId);
    add(entry.artistId);
    addArtwork(entry.coverArt);
  }

  for (const entry of useActivity.getState().activity) {
    add(entry.trackId);
    add(entry.albumId);
    add(entry.artistId);
    addArtwork(entry.coverArt);
    add(entry.source?.id);
    addArtwork(entry.source?.coverArt);
  }

  for (const key of Object.keys(useBookmarks.getState().bookmarks)) add(key);

  const playlists = usePlaylists.getState();
  for (const key of Object.keys(playlists.playlistSorts)) add(key);
  for (const [key, order] of Object.entries(playlists.playlistTrackOrders)) {
    add(key);
    for (const trackId of order) add(trackId);
  }

  for (const entry of useRecentPlays.getState().recentPlays) {
    if (isRemappableRecentPlay(entry)) add(entry.id);
    addArtwork(entry.coverArt);
  }

  for (const entry of useRecentSearches.getState().recentSearches) {
    if (entry.type !== "query") add(entry.id);
    add(entry.albumId);
    addArtwork(entry.coverArt);
  }

  const scope = currentAuthScope();
  for (const station of useRadioStations.getState().favoriteRadioStations) {
    // Radio Browser stations are keyed by their own UUIDs and belong to no
    // server — transforming those would corrupt them.
    if (station.source !== "server") continue;
    if (station.scope !== scope) continue;
    add(station.id);
  }

  for (const mutation of useOfflineMutations.getState().queue) {
    const action = mutation.action;
    switch (action.type) {
      case "star":
        add(action.target.id);
        break;
      case "setRating":
        add(action.id);
        break;
      case "playlistAddSongs":
      case "playlistRemoveSongs":
        add(action.playlistId);
        for (const songId of action.songIds) add(songId);
        break;
      case "playlistEdit":
      case "playlistDelete":
        add(action.playlistId);
        break;
    }
  }

  return ids;
}

function applyRemap(remap: Remap): void {
  // The offline store goes first: the queue rebuilds its playback URLs from the
  // already-remapped downloaded-track paths.
  const offline = useOffline.getState();
  const downloadedTracks = Object.fromEntries(
    Object.entries(offline.downloadedTracks).map(([key, track]) => {
      const id = remap(track.id);
      return [
        remap(key),
        {
          ...track,
          id,
          coverArt: remapArtworkId(track.coverArt, remap),
          // `path` is an absolute file URI and stays valid: the filename embeds
          // the old id but nothing ever reads it back out. Record the legacy id
          // for auditability, in the field that was declared but never used —
          // only when this run actually moved the id, so a second (no-op) run
          // can't overwrite the original with the already-canonical one.
          metadata:
            id === track.id
              ? track.metadata
              : { ...(track.metadata ?? {}), legacyId: track.id },
        },
      ];
    }),
  );
  const downloadedCollections = Object.fromEntries(
    Object.entries(offline.downloadedCollections).map(([key, collection]) => [
      remap(key),
      {
        ...collection,
        id: remap(collection.id),
        artistId: remapOptional(collection.artistId, remap),
        artists: collection.artists?.map((artist) => ({
          ...artist,
          id: remap(artist.id),
        })),
        coverArt: remapArtworkId(collection.coverArt, remap),
        trackIds: collection.trackIds.map(remap),
      },
    ]),
  );
  const artworkCache = Object.fromEntries(
    Object.entries(offline.artworkCache).map(([key, value]) => [
      remapArtworkId(key, remap),
      value,
    ]),
  );
  const artworkCachedAt = Object.fromEntries(
    Object.entries(offline.artworkCachedAt).map(([key, value]) => [
      remapArtworkId(key, remap),
      value,
    ]),
  );
  const artworkAliases = Object.fromEntries(
    Object.entries(offline.artworkAliases).map(([from, to]) => [
      remapArtworkId(from, remap),
      remapArtworkId(to, remap),
    ]),
  );
  // Downloads already writing to disk carry their pre-migration id and would
  // register it back into the store the moment they land. Make them discard
  // their result instead; their queue entry survives the remap below and is
  // retried under the canonical id.
  offlineDownloadService.discardInFlightDownloads();
  const downloadQueue = useOffline.getState().downloadQueue.map((queued) => ({
    ...queued,
    id: remap(queued.id),
    albumId: remapOptional(queued.albumId, remap),
    artistId: remapOptional(queued.artistId, remap),
    artists: queued.artists?.map((artist) => ({
      ...artist,
      id: remap(artist.id),
    })),
    coverArt: remapArtworkId(queued.coverArt, remap),
    // NOT queued.musicBrainzId — see the header note.
  }));
  useOffline.setState({
    downloadedTracks,
    downloadedCollections,
    artworkCache,
    artworkCachedAt,
    artworkAliases,
    // Pending downloads are kept: nothing re-enqueues a user-initiated save, so
    // dropping them would silently lose an album the user asked for. In-flight
    // progress is derived state and cheaper to rebuild than to rewrite.
    downloadProgress: {},
    downloadQueue,
  });

  const queue = useQueue.getState();
  const remappedTracks = useOffline.getState().downloadedTracks;
  useQueue.setState({
    queue: queue.queue.map((track) => {
      if (isExternalMedia(track)) {
        return isServerRadio(track) ? { ...track, id: remap(track.id) } : track;
      }
      const id = remap(track.id);
      const downloaded = remappedTracks[id];
      return {
        ...track,
        id,
        // The old song id is baked into the persisted stream URL by
        // utils/childToTrack.ts, so rewriting `id` alone would leave the queue
        // playing 404s.
        url: downloaded ? downloaded.path : streamUrl(id),
        coverArt: remapArtworkId(track.coverArt, remap),
        artwork: track.coverArt
          ? artworkUrl(remapArtworkId(track.coverArt, remap))
          : track.artwork,
        albumId: remapOptional(track.albumId, remap),
        artistId: remapOptional(track.artistId, remap),
        artists: track.artists?.map((artist: { id: string }) => ({
          ...artist,
          id: remap(artist.id),
        })),
      };
    }),
    originalOrderIds: queue.originalOrderIds?.map(remap) ?? null,
    source: queue.source
      ? {
          ...queue.source,
          id: remapOptional(queue.source.id, remap),
          coverArt: remapArtworkId(queue.source.coverArt, remap),
        }
      : queue.source,
  });

  usePlayHistory.setState({
    history: usePlayHistory.getState().history.map((entry) => ({
      ...entry,
      id: remap(entry.id),
      albumId: remapOptional(entry.albumId, remap),
      artistId: remapOptional(entry.artistId, remap),
      coverArt: remapArtworkId(entry.coverArt, remap),
      // Every id was verified against the pre-migration server; that verdict no
      // longer means anything.
      verifiedAt: undefined,
    })),
  });

  useActivity.setState({
    activity: useActivity.getState().activity.map((entry) => ({
      ...entry,
      trackId: remap(entry.trackId),
      albumId: remapOptional(entry.albumId, remap),
      artistId: remapOptional(entry.artistId, remap),
      coverArt: remapArtworkId(entry.coverArt, remap),
      source: entry.source
        ? {
            ...entry.source,
            id: remap(entry.source.id),
            coverArt: remapArtworkId(entry.source.coverArt, remap),
          }
        : entry.source,
    })),
  });

  useBookmarks.setState({
    bookmarks: remapKeys(useBookmarks.getState().bookmarks, remap),
  });

  const playlists = usePlaylists.getState();
  usePlaylists.setState({
    playlistSorts: remapKeys(playlists.playlistSorts, remap),
    playlistTrackOrders: Object.fromEntries(
      Object.entries(playlists.playlistTrackOrders).map(([key, order]) => [
        remap(key),
        order.map(remap),
      ]),
    ),
  });

  useRecentPlays.setState({
    recentPlays: useRecentPlays.getState().recentPlays.map((entry) => ({
      ...entry,
      id: isRemappableRecentPlay(entry) ? remap(entry.id) : entry.id,
      coverArt: remapArtworkId(entry.coverArt, remap),
    })),
  });

  useRecentSearches.setState({
    recentSearches: useRecentSearches
      .getState()
      .recentSearches.map((entry) => ({
        ...entry,
        id: entry.type === "query" ? entry.id : remap(entry.id),
        albumId: remapOptional(entry.albumId, remap),
        coverArt: remapArtworkId(entry.coverArt, remap),
      })),
  });

  const scope = currentAuthScope();
  useRadioStations.setState({
    favoriteRadioStations: useRadioStations
      .getState()
      .favoriteRadioStations.map((station) =>
        station.source === "server" && station.scope === scope
          ? { ...station, id: remap(station.id) }
          : station,
      ),
  });

  useOfflineMutations.setState({
    queue: useOfflineMutations.getState().queue.map((mutation) => {
      const action = mutation.action;
      switch (action.type) {
        case "star":
          return {
            ...mutation,
            action: {
              ...action,
              target: { ...action.target, id: remap(action.target.id) },
            },
          };
        case "setRating":
          return { ...mutation, action: { ...action, id: remap(action.id) } };
        case "playlistAddSongs":
        case "playlistRemoveSongs":
          return {
            ...mutation,
            action: {
              ...action,
              playlistId: remap(action.playlistId),
              songIds: action.songIds.map(remap),
            },
          };
        case "playlistEdit":
        case "playlistDelete":
          return {
            ...mutation,
            action: { ...action, playlistId: remap(action.playlistId) },
          };
        default:
          return mutation;
      }
    }),
  });

  // The crawl's seenSongIds inventory describes the pre-migration library, and
  // a resumed pass carrying it would read every remapped id as a server-side
  // deletion. Start the next pass from scratch.
  useLibrarySync.getState().resetCursor();
}

/**
 * Rewrites every persisted id to its canonical form. Idempotent: already-
 * canonical ids map to themselves, so a second run is a no-op.
 *
 * Operates on the live (hydrated) stores rather than raw MMKV — each store's
 * existing persistence writes the result through.
 *
 * @returns how many distinct ids actually changed.
 */
export async function applyCanonicalIdRemap(): Promise<number> {
  const map = await canonicalIdMap(collectIds());
  const remap: Remap = (id) => map.get(id) ?? id;

  let changed = 0;
  for (const [from, to] of map) if (from !== to) changed++;

  applyRemap(remap);

  // Cached responses are full of pre-migration ids. Unlike the stores there is
  // nothing worth salvaging: album and playlist ids move too, so most keys are
  // stale. Same pair the Storage settings screen uses.
  queryClient.clear();
  void queryPersister.removeClient();

  return changed;
}

export const __testing = { collectIds, applyRemap, remapArtworkId };
