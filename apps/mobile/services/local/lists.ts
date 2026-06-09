import { localAlbumId } from "@/services/local/keys";
import { mapAggToAlbum, mapRowToChild } from "@/services/local/mappers";
import {
  type AlbumAggRow,
  type AlbumOrder,
  queryAlbums,
  querySongs,
} from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { Child } from "@/services/openSubsonic/types";

// Maps a Subsonic album-list `type` onto the SQLite ordering we can serve.
// Concepts the local index doesn't track (play counts, ratings, favourites)
// fall back to a sensible neighbour or an empty result.
const ORDER_FOR_TYPE: Record<AlbumListType, AlbumOrder | "starred"> = {
  random: "random",
  newest: "recent",
  recent: "recent",
  frequent: "recent",
  highest: "name",
  alphabeticalByName: "name",
  alphabeticalByArtist: "artist",
  starred: "starred",
  byYear: "year",
  byGenre: "name",
};

type ListOpts = {
  size?: number;
  offset?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
};

async function albumsForType(
  type: AlbumListType,
  opts: ListOpts,
): Promise<AlbumAggRow[]> {
  const order = ORDER_FOR_TYPE[type];
  if (order === "starred") return []; // no favourites in the local index
  return queryAlbums({
    order,
    limit: opts.size ?? 10,
    offset: opts.offset ?? 0,
    genre: type === "byGenre" ? opts.genre : undefined,
    fromYear: opts.fromYear,
    toYear: opts.toYear,
  });
}

function aggToDirChild(row: AlbumAggRow): Child {
  return {
    id: localAlbumId(row.album_key),
    isDir: true,
    title: row.name ?? "Unknown album",
    album: row.name ?? undefined,
    artist: row.album_artist ?? row.artist ?? undefined,
    coverArt: row.cover ?? undefined,
    year: row.year ?? undefined,
    songCount: row.song_count,
  } as Child;
}

export const getAlbumList = async (type: AlbumListType, opts: ListOpts) => {
  const rows = await albumsForType(type, opts);
  return localEnvelope({ albumList: { album: rows.map(aggToDirChild) } });
};

export const getAlbumList2 = async (type: AlbumListType, opts: ListOpts) => {
  const rows = await albumsForType(type, opts);
  return localEnvelope({ albumList2: { album: rows.map(mapAggToAlbum) } });
};

export const getRandomSongs = async (
  opts: {
    size?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  } = {},
) => {
  const rows = await querySongs({
    random: true,
    limit: opts.size ?? 10,
    genre: opts.genre,
    fromYear: opts.fromYear,
    toYear: opts.toYear,
  });
  return localEnvelope({ songs: { song: rows.map(mapRowToChild) } });
};

export const getSongsByGenre = async (
  genre: string,
  opts: { count?: number; offset?: number; musicFolderId?: string } = {},
) => {
  const rows = await querySongs({
    genre,
    limit: opts.count ?? 10,
    offset: opts.offset ?? 0,
  });
  return localEnvelope({ songs: { song: rows.map(mapRowToChild) } });
};

export const getNowPlaying = async () => {
  return localEnvelope({ nowPlaying: { entry: [] } });
};

// The local index has no favourites concept; report empty starred lists.
export const getStarred = async (_opts: { musicFolderId?: string } = {}) => {
  return localEnvelope({ starred: { album: [], artist: [], song: [] } });
};

export const getStarred2 = async (_opts: { musicFolderId?: string } = {}) => {
  return localEnvelope({ starred2: { album: [], artist: [], song: [] } });
};
