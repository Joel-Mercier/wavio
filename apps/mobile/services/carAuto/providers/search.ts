import { getPlaylists } from "@/services/backend/playlists";
import { search3 } from "@/services/backend/searching";
import { getIsEffectivelyOnline } from "@/services/network";
import { offlineTrackToChild } from "@/services/offline/collections";
import type {
  AlbumID3,
  ArtistID3,
  Child,
  Playlist,
} from "@/services/openSubsonic/types";
import { currentAuthScope } from "@/stores/auth";
import useOffline from "@/stores/offline";
import { childToTrack } from "@/utils/childToTrack";
import { encodeMediaId } from "../mediaId";
import {
  albumNode,
  artistNode,
  grouped,
  playlistNode,
  t,
  trackNode,
} from "../nodes";
import { folderIds, type Listing } from "./shared";

const SONG_COUNT = 20;
const ALBUM_COUNT = 10;
const ARTIST_COUNT = 10;
const PLAYLIST_COUNT = 10;

export type SearchHits = {
  songs: Child[];
  albums: AlbumID3[];
  artists: ArtistID3[];
  playlists: Playlist[];
};

const normalize = (value: string | undefined) =>
  (value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();

export const matches = (value: string | undefined, query: string) =>
  normalize(value).includes(normalize(query));

function offlineHits(query: string): SearchHits {
  const offline = useOffline.getState();
  const songs = offline
    .getDownloadedTracksList()
    .filter(
      (track) =>
        matches(track.title, query) ||
        matches(track.artist, query) ||
        matches(track.album, query),
    )
    .slice(0, SONG_COUNT)
    .map(offlineTrackToChild);
  const albums = offline
    .getDownloadedCollections()
    .filter(
      (collection) =>
        collection.kind === "album" &&
        (matches(collection.name, query) || matches(collection.artist, query)),
    )
    .slice(0, ALBUM_COUNT)
    .map(
      (collection): AlbumID3 =>
        ({
          id: collection.id,
          name: collection.name,
          artist: collection.artist,
          artistId: collection.artistId,
          coverArt: collection.coverArt,
          songCount: collection.songCount,
        }) as AlbumID3,
    );
  return { songs, albums, artists: [], playlists: [] };
}

const PLAYLISTS_TTL_MS = 60 * 1000;
let playlistsCache: {
  scope: string | null;
  at: number;
  playlists: Promise<Playlist[]>;
} | null = null;

function allPlaylists(): Promise<Playlist[]> {
  const scope = currentAuthScope();
  if (
    playlistsCache?.scope === scope &&
    Date.now() - playlistsCache.at < PLAYLISTS_TTL_MS
  ) {
    return playlistsCache.playlists;
  }
  const playlists = getPlaylists({}).then(
    (rsp) => rsp.playlists?.playlist ?? [],
  );
  playlistsCache = { scope, at: Date.now(), playlists };
  playlists.catch(() => {
    if (playlistsCache?.playlists === playlists) playlistsCache = null;
  });
  return playlists;
}

async function playlistHits(query: string): Promise<Playlist[]> {
  const playlists = await allPlaylists().catch(() => [] as Playlist[]);
  return playlists
    .filter((playlist) => matches(playlist.name, query))
    .slice(0, PLAYLIST_COUNT);
}

export async function searchHits(query: string): Promise<SearchHits> {
  if (!getIsEffectivelyOnline()) return offlineHits(query);
  const [rsp, playlists] = await Promise.all([
    search3(query, {
      songCount: SONG_COUNT,
      albumCount: ALBUM_COUNT,
      artistCount: ARTIST_COUNT,
      musicFolderIds: folderIds(),
    }),
    playlistHits(query),
  ]);
  const result = rsp.searchResult3;
  return {
    songs: result?.song ?? [],
    albums: result?.album ?? [],
    artists: result?.artist ?? [],
    playlists,
  };
}

export function searchListing(query: string, hits: SearchHits): Listing {
  const parentId = encodeMediaId({ kind: "search", query });
  return {
    nodes: [
      ...grouped(
        hits.songs.map((song) => trackNode(song, parentId)),
        t("search.songs"),
      ),
      ...grouped(
        hits.albums.map((album) => albumNode(album, "list")),
        t("search.albums"),
      ),
      ...grouped(
        hits.artists.map((artist) => artistNode(artist)),
        t("search.artists"),
      ),
      ...grouped(
        hits.playlists.map((playlist) => playlistNode(playlist, "list")),
        t("search.playlists"),
      ),
    ],
    tracks: hits.songs.map(childToTrack),
    source: null,
  };
}

export async function runSearch(query: string): Promise<Listing> {
  return searchListing(query, await searchHits(query));
}
