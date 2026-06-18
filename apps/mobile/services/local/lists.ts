import {
  localAlbumId,
  parseLocalAlbumId,
  parseLocalArtistId,
} from "@/services/local/keys";
import { unknownAlbumLabel } from "@/services/local/labels";
import {
  mapAggToAlbum,
  mapAggToArtist,
  mapRowToChild,
} from "@/services/local/mappers";
import {
  type AlbumAggRow,
  type AlbumOrder,
  queryAlbumByKey,
  queryAlbums,
  queryArtistByKey,
  querySongs,
  queryTrackById,
} from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type {
  AlbumID3,
  Artist,
  ArtistID3,
  Child,
} from "@/services/openSubsonic/types";
import useLocalLibrary, { type FavoriteMap } from "@/stores/localLibrary";

// Maps a Subsonic album-list `type` onto how we serve it locally.
//  - SQLite orders: play counts ("plays"=frequent) and last-played ("played"=
//    recent) come from track_stats; the rest are static index orders.
//  - "starred"/"rated" are resolved from the on-device store (favourites /
//    ratings) rather than from a SQL ordering.
const ORDER_FOR_TYPE: Record<AlbumListType, AlbumOrder | "starred" | "rated"> =
  {
    random: "random",
    newest: "recent",
    recent: "played",
    frequent: "plays",
    highest: "rated",
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

// Albums whose id the user has rated, highest rating first, resolved back to
// their indexed rows (mirrors the favourites path in starredAlbums below).
// Ratings live in stores/localLibrary.ts; ids no longer in the index are dropped.
async function ratedAlbums(
  offset: number,
  size: number,
): Promise<AlbumAggRow[]> {
  const albumIds = Object.entries(useLocalLibrary.getState().ratings)
    .filter(([id]) => parseLocalAlbumId(id) != null)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .slice(offset, offset + size);
  const rows = await Promise.all(
    albumIds.map((id) => {
      const key = parseLocalAlbumId(id);
      return key != null ? queryAlbumByKey(key) : Promise.resolve(null);
    }),
  );
  return rows.filter((r): r is AlbumAggRow => r != null);
}

async function albumsForType(
  type: AlbumListType,
  opts: ListOpts,
): Promise<AlbumAggRow[]> {
  const order = ORDER_FOR_TYPE[type];
  if (order === "starred") return []; // favourites surface via getStarred2
  if (order === "rated") return ratedAlbums(opts.offset ?? 0, opts.size ?? 10);
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
    title: row.name ?? unknownAlbumLabel(),
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

// Favourites are stored on-device (stores/localLibrary.ts → favoriteTracks /
// favoriteAlbums / favoriteArtists). Resolve each starred id back to its indexed
// row, oldest-starred first; ids whose file/album/artist has since left the
// index are dropped. The mappers stamp the `starred` date from the same store.

/** Starred ids ordered oldest → newest by when they were favourited. */
function orderedIds(map: FavoriteMap): string[] {
  return Object.entries(map)
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);
}

async function starredSongs(): Promise<Child[]> {
  const ids = orderedIds(useLocalLibrary.getState().favoriteTracks);
  const rows = await Promise.all(ids.map((id) => queryTrackById(id)));
  return rows.filter((r) => r != null).map(mapRowToChild);
}

async function starredAlbums(): Promise<AlbumID3[]> {
  const ids = orderedIds(useLocalLibrary.getState().favoriteAlbums);
  const rows = await Promise.all(
    ids.map((id) => {
      const key = parseLocalAlbumId(id);
      return key != null ? queryAlbumByKey(key) : Promise.resolve(null);
    }),
  );
  return rows.filter((r) => r != null).map(mapAggToAlbum);
}

async function starredArtists(): Promise<ArtistID3[]> {
  const ids = orderedIds(useLocalLibrary.getState().favoriteArtists);
  const rows = await Promise.all(
    ids.map((id) => {
      const key = parseLocalArtistId(id);
      return key != null ? queryArtistByKey(key) : Promise.resolve(null);
    }),
  );
  return rows.filter((r) => r != null).map(mapAggToArtist);
}

export const getStarred = async (_opts: { musicFolderId?: string } = {}) => {
  const [song, albums, artists] = await Promise.all([
    starredSongs(),
    starredAlbums(),
    starredArtists(),
  ]);
  // Subsonic v1 shapes: albums as directory `Child`, artists as plain `Artist`.
  const album: Child[] = albums.map((a) => ({
    id: a.id,
    isDir: true,
    title: a.name,
    album: a.name,
    artist: a.artist,
    artistId: a.artistId,
    coverArt: a.coverArt,
    year: a.year,
    songCount: a.songCount,
    starred: a.starred,
  }));
  const artist: Artist[] = artists.map((a) => ({
    id: a.id,
    name: a.name,
    coverArt: a.coverArt,
    albumCount: a.albumCount,
    starred: a.starred,
  }));
  return localEnvelope({ starred: { album, artist, song } });
};

export const getStarred2 = async (_opts: { musicFolderId?: string } = {}) => {
  const [song, album, artist] = await Promise.all([
    starredSongs(),
    starredAlbums(),
    starredArtists(),
  ]);
  return localEnvelope({ starred2: { album, artist, song } });
};
