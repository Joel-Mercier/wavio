import type { QueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { offlineTrackToChild } from "@/services/offline/collections";
import type {
  AlbumID3,
  AlbumList2,
  AlbumWithSongsID3,
  ArtistID3,
  ArtistsID3,
  ArtistWithAlbumsID3,
  Child,
  PlaylistWithSongs,
  SearchResult3,
  Starred2,
} from "@/services/openSubsonic/types";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";

// Offline search corpus + index. When the app is effectively offline the server
// `search3` query is paused, so we search over everything that is downloaded or
// still present in the persisted React Query cache instead, returning the same
// `SearchResult3` shape the online path does. Pure functions, no hooks — the
// results never touch the persisted `["search3", ...]` cache namespace.

export type OfflineSearchCorpus = {
  songs: Child[];
  albums: AlbumID3[];
  artists: ArtistID3[];
};

export type OfflineSearchIndex = {
  songs: Fuse<Child>;
  albums: Fuse<AlbumID3>;
  artists: Fuse<ArtistID3>;
};

type OfflineSearchParams = {
  artistCount?: number;
  albumCount?: number;
  songCount?: number;
};

export function buildOfflineSearchCorpus(
  queryClient: QueryClient,
  downloadedTracks: Record<string, OfflineTrack>,
  downloadedCollections: Record<string, OfflineCollection>,
): OfflineSearchCorpus {
  // Keyed by id so server-shaped cache entries harvested below overwrite the
  // store-reconstructed ones (cache wins).
  const songs = new Map<string, Child>();
  const albums = new Map<string, AlbumID3>();
  const artists = new Map<string, ArtistID3>();

  // An album/artist row must be *openable* offline, else tapping it lands on an
  // empty detail screen. `AlbumDetail` renders from `["album", id]` cache OR a
  // downloaded album collection; `ArtistDetail` renders only from `["artist", id]`
  // cache (no download fallback). We still harvest metadata-only entries from
  // artist/list/starred/search caches for richer dedupe, but drop any that aren't
  // in these sets before returning.
  const openableAlbumIds = new Set<string>();
  const openableArtistIds = new Set<string>();

  // `OfflineTrack` carries no albumId, but `SearchResultListItem` routes songs to
  // `/albums/:albumId`; recover it from the owning album collection.
  const trackAlbumId = new Map<string, string>();
  for (const collection of Object.values(downloadedCollections)) {
    if (collection.kind !== "album") continue;
    for (const trackId of collection.trackIds) {
      trackAlbumId.set(trackId, collection.id);
    }
  }

  for (const track of Object.values(downloadedTracks)) {
    const child = offlineTrackToChild(track);
    const albumId = trackAlbumId.get(track.id);
    songs.set(child.id, albumId ? { ...child, albumId } : child);
  }

  for (const collection of Object.values(downloadedCollections)) {
    if (collection.kind !== "album") continue;
    openableAlbumIds.add(collection.id);
    albums.set(collection.id, {
      id: collection.id,
      name: collection.name,
      artist: collection.artist,
      artistId: collection.artistId,
      year: collection.year,
      coverArt: collection.coverArt,
      songCount: collection.songCount,
      duration: 0,
      created: new Date(collection.savedAt),
    });
  }

  const addSongs = (list?: Child[]) => {
    for (const song of list ?? []) {
      if (song?.id) songs.set(song.id, song);
    }
  };
  const addAlbums = (list?: AlbumID3[]) => {
    for (const album of list ?? []) {
      if (album?.id) albums.set(album.id, album);
    }
  };
  const addArtists = (list?: ArtistID3[]) => {
    for (const artist of list ?? []) {
      if (artist?.id) artists.set(artist.id, artist);
    }
  };

  // Harvest the persisted RQ cache. Query keys prefix-match element-wise, so
  // `["album"]` hits `["album", id]` but not `["albumList2", ...]` /
  // `["albumInfo", ...]`; the `albumList2:infinite` variant is excluded the same
  // way. Persisted entries can restore with `data: undefined`, hence the chains.
  for (const [, data] of queryClient.getQueriesData<{
    album?: AlbumWithSongsID3;
  }>({ queryKey: ["album"] })) {
    if (data?.album) {
      addAlbums([data.album]);
      openableAlbumIds.add(data.album.id);
    }
    addSongs(data?.album?.song);
  }

  for (const [, data] of queryClient.getQueriesData<{
    artist?: ArtistWithAlbumsID3;
  }>({ queryKey: ["artist"] })) {
    if (data?.artist) {
      addArtists([data.artist]);
      openableArtistIds.add(data.artist.id);
    }
    addAlbums(data?.artist?.album);
  }

  for (const [, data] of queryClient.getQueriesData<{
    playlist?: PlaylistWithSongs;
  }>({ queryKey: ["playlist"] })) {
    addSongs(data?.playlist?.entry);
  }

  for (const [, data] of queryClient.getQueriesData<{
    albumList2?: AlbumList2;
  }>({ queryKey: ["albumList2"] })) {
    addAlbums(data?.albumList2?.album);
  }

  for (const [, data] of queryClient.getQueriesData<{ starred2?: Starred2 }>({
    queryKey: ["starred2"],
  })) {
    addAlbums(data?.starred2?.album);
    addArtists(data?.starred2?.artist);
    addSongs(data?.starred2?.song);
  }

  for (const [, data] of queryClient.getQueriesData<{ artists?: ArtistsID3 }>({
    queryKey: ["artists"],
  })) {
    for (const index of data?.artists?.index ?? []) {
      addArtists(index.artist);
    }
  }

  for (const [, data] of queryClient.getQueriesData<{
    searchResult3?: SearchResult3;
  }>({ queryKey: ["search3"] })) {
    addAlbums(data?.searchResult3?.album);
    addArtists(data?.searchResult3?.artist);
    addSongs(data?.searchResult3?.song);
  }

  return {
    songs: Array.from(songs.values()),
    albums: Array.from(albums.values()).filter((a) =>
      openableAlbumIds.has(a.id),
    ),
    artists: Array.from(artists.values()).filter((a) =>
      openableArtistIds.has(a.id),
    ),
  };
}

// The default threshold (0.6) is too fuzzy for a multi-key corpus; 0.4 keeps
// matches relevant while still tolerating typos/partials.
const FUSE_OPTIONS = {
  includeScore: true,
  ignoreDiacritics: true,
  threshold: 0.4,
} as const;

export function createOfflineSearchIndex(
  corpus: OfflineSearchCorpus,
): OfflineSearchIndex {
  return {
    songs: new Fuse(corpus.songs, {
      ...FUSE_OPTIONS,
      keys: ["title", "artist", "album"],
    }),
    albums: new Fuse(corpus.albums, {
      ...FUSE_OPTIONS,
      keys: ["name", "artist"],
    }),
    artists: new Fuse(corpus.artists, { ...FUSE_OPTIONS, keys: ["name"] }),
  };
}

export function searchOfflineIndex(
  index: OfflineSearchIndex,
  query: string,
  params: OfflineSearchParams,
): SearchResult3 {
  // `?? 20` (not `||`) so the library albums screen's explicit `songCount: 0` /
  // `artistCount: 0` caps are honored rather than defaulted to 20.
  const albumCount = params.albumCount ?? 20;
  const artistCount = params.artistCount ?? 20;
  const songCount = params.songCount ?? 20;
  return {
    album: index.albums
      .search(query)
      .slice(0, albumCount)
      .map((r) => r.item),
    artist: index.artists
      .search(query)
      .slice(0, artistCount)
      .map((r) => r.item),
    song: index.songs
      .search(query)
      .slice(0, songCount)
      .map((r) => r.item),
  };
}
