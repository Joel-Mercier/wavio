import {
  getAlbum,
  getArtist,
  getArtists,
  getGenres,
} from "@/services/backend/browsing";
import { getAlbumList2, getStarred2 } from "@/services/backend/lists";
import { getPlaylist, getPlaylists } from "@/services/backend/playlists";
import type { Child } from "@/services/openSubsonic/types";
import { fetchTopSongs } from "@/services/topSongs";
import { FAVORITES_QUEUE_SOURCE_ID } from "@/utils/activeRecentPlay";
import { childToTrack } from "@/utils/childToTrack";
import { encodeMediaId, type FavoritesKind } from "../mediaId";
import {
  albumNode,
  artistNode,
  CAR_LIST_LIMIT,
  cover,
  grouped,
  playlistNode,
  playsOnTap,
  sectionNode,
  styleFor,
  t,
  trackNode,
} from "../nodes";
import type { BrowseNode } from "../types";
import { folderIds, type Listing } from "./shared";

const ARTIST_ALBUM_LIMIT = 100;
const ARTIST_LIST_LIMIT = 1000;
const GENRE_ALBUM_LIMIT = 100;
const TOP_SONG_COUNT = 10;

export function tracklist(
  parentId: string,
  songs: Child[],
  source: Listing["source"],
): Listing {
  return {
    nodes: songs
      .slice(0, CAR_LIST_LIMIT)
      .map((song) => trackNode(song, parentId)),
    tracks: songs.map(childToTrack),
    source,
  };
}

export async function albumListing(id: string): Promise<Listing> {
  const { album } = await getAlbum(id);
  const parentId = encodeMediaId({ kind: "album", id });
  return tracklist(parentId, album.song ?? [], {
    type: "album",
    id,
    name: album.name,
    coverArt: album.coverArt,
  });
}

export async function playlistListing(id: string): Promise<Listing> {
  const { playlist } = await getPlaylist(id);
  const parentId = encodeMediaId({ kind: "playlist", id });
  return tracklist(parentId, playlist.entry ?? [], {
    type: "playlist",
    id,
    name: playlist.name,
    coverArt: playlist.coverArt,
  });
}

export async function playlistsListing(): Promise<Listing> {
  const rsp = await getPlaylists({});
  const style = styleFor("playlists");
  const favorites = sectionNode(
    encodeMediaId({ kind: "favorites", of: "songs" }),
    t("favorites.songs"),
    { playable: playsOnTap(), icon: "favorites", itemStyle: style },
  );
  return {
    nodes: [
      favorites,
      ...(rsp.playlists?.playlist ?? []).map((playlist) =>
        playlistNode(playlist, style),
      ),
    ],
  };
}

export async function artistListing(id: string): Promise<Listing> {
  const { artist } = await getArtist(id);
  const parentId = encodeMediaId({ kind: "artist", id });
  const topSongs = await fetchTopSongs({
    id,
    name: artist.name,
    count: TOP_SONG_COUNT,
  }).catch(() => [] as Child[]);
  const albumStyle = styleFor("albums");
  const mix: BrowseNode = {
    id: encodeMediaId({ kind: "mix", mix: "artist", arg: id }),
    title: t("artistMix"),
    subtitle: artist.name,
    artworkUrl: cover(artist.coverArt),
    playable: true,
  };
  const albums = (artist.album ?? [])
    .slice(0, ARTIST_ALBUM_LIMIT)
    .map((album) => albumNode(album, albumStyle));
  return {
    nodes: [
      mix,
      ...grouped(
        topSongs.map((song) => trackNode(song, parentId)),
        t("topSongs"),
      ),
      ...grouped(albums, t("sections.albums")),
    ],
    tracks: topSongs.map(childToTrack),
    source: {
      type: "artist",
      id,
      name: artist.name,
      coverArt: artist.coverArt,
    },
  };
}

export async function artistsListing(): Promise<Listing> {
  const rsp = await getArtists({ musicFolderIds: folderIds() });
  const style = styleFor("artists");
  const nodes: BrowseNode[] = [];
  for (const index of rsp.artists?.index ?? []) {
    for (const artist of index.artist ?? []) {
      if (nodes.length >= ARTIST_LIST_LIMIT) break;
      nodes.push(
        artistNode(artist, { groupTitle: index.name, itemStyle: style }),
      );
    }
  }
  return { nodes };
}

export async function genresListing(): Promise<Listing> {
  const rsp = await getGenres();
  const genres = [...(rsp.genres?.genre ?? [])].sort((a, b) =>
    a.songCount != null && b.songCount != null
      ? b.songCount - a.songCount
      : a.value.localeCompare(b.value),
  );
  const style = styleFor("genres");
  return {
    nodes: genres.map((genre) =>
      sectionNode(
        encodeMediaId({ kind: "genre", name: genre.value }),
        genre.value,
        {
          subtitle: genre.albumCount
            ? t("albumCount", { count: genre.albumCount })
            : undefined,
          playable: playsOnTap(),
          itemStyle: style,
          childrenStyle: styleFor("albums"),
        },
      ),
    ),
  };
}

export async function genreListing(name: string): Promise<Listing> {
  const rsp = await getAlbumList2("byGenre", {
    genre: name,
    size: GENRE_ALBUM_LIMIT,
    musicFolderIds: folderIds(),
  });
  const shuffle: BrowseNode = {
    id: encodeMediaId({ kind: "mix", mix: "genre", arg: name }),
    title: t("shuffleGenre", { genre: name }),
    playable: true,
    icon: "shuffle",
    itemStyle: "list",
  };
  const style = styleFor("albums");
  return {
    nodes: [
      shuffle,
      ...(rsp.albumList2?.album ?? []).map((album) => albumNode(album, style)),
    ],
  };
}

export async function favoritesKindListing(
  of: FavoritesKind,
): Promise<Listing> {
  const rsp = await getStarred2({ musicFolderIds: folderIds() });
  const starred = rsp.starred2;
  if (of === "albums") {
    const style = styleFor("albums");
    return {
      nodes: (starred?.album ?? []).map((album) => albumNode(album, style)),
    };
  }
  if (of === "artists") {
    return {
      nodes: (starred?.artist ?? []).map((artist) => artistNode(artist)),
    };
  }
  return tracklist(
    encodeMediaId({ kind: "favorites", of: "songs" }),
    starred?.song ?? [],
    {
      type: "likedSongs",
      id: FAVORITES_QUEUE_SOURCE_ID,
      name: t("favorites.songs"),
    },
  );
}
