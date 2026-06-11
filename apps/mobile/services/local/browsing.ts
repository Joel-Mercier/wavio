import {
  normalizeKey,
  parseLocalAlbumId,
  parseLocalArtistId,
} from "@/services/local/keys";
import {
  buildArtistIndex,
  mapAggToAlbum,
  mapAggToArtist,
  mapGenreRow,
  mapRowToChild,
} from "@/services/local/mappers";
import { localFolders } from "@/services/local/paths";
import {
  queryAlbumByKey,
  queryAlbumTracksByKey,
  queryArtistAlbumsByKey,
  queryArtists,
  queryGenres,
  queryTopSongsByArtist,
  queryTrackById,
} from "@/services/local/repository";
import {
  LocalUnsupportedError,
  localEnvelope,
} from "@/services/local/unsupported";
import type {
  AlbumWithSongsID3,
  ArtistWithAlbumsID3,
  Index,
  Indexes,
  MusicFolder,
} from "@/services/openSubsonic/types";

const basename = (path: string): string =>
  path.replace(/\/+$/, "").split("/").pop() || path;

export const getMusicFolders = async () => {
  const musicFolder: MusicFolder[] = localFolders().map((path) => ({
    id: path,
    name: basename(path),
  }));
  return localEnvelope({ musicFolders: { musicFolder } });
};

export const getArtists = async (_opts: { musicFolderId?: string } = {}) => {
  const rows = await queryArtists();
  const index = buildArtistIndex(rows.map(mapAggToArtist));
  return localEnvelope({ artists: { ignoredArticles: "", index } });
};

export const getIndexes = async (
  _opts: { musicFolderId?: string; ifModifiedSince?: number } = {},
) => {
  const rows = await queryArtists();
  // Indexes uses the lighter `Artist` shape (id + name) rather than ArtistID3.
  const index: Index[] = buildArtistIndex(rows.map(mapAggToArtist)).map(
    (b) => ({
      name: b.name,
      artist: (b.artist ?? []).map((a) => ({ id: a.id, name: a.name })),
    }),
  );
  const indexes: Indexes = {
    ignoredArticles: "",
    lastModified: Date.now(),
    index,
  };
  return localEnvelope({ indexes });
};

export const getArtist = async (id: string) => {
  const key = parseLocalArtistId(id);
  if (key == null) throw new LocalUnsupportedError(`artist id "${id}"`);
  const albumRows = await queryArtistAlbumsByKey(key);
  const albums = albumRows.map(mapAggToAlbum);
  const artist: ArtistWithAlbumsID3 = {
    id,
    name:
      albumRows[0]?.album_artist ?? albumRows[0]?.artist ?? "Unknown artist",
    albumCount: albums.length,
    coverArt: albumRows[0]?.cover ?? undefined,
    album: albums,
  };
  return localEnvelope({ artist });
};

export const getAlbum = async (id: string) => {
  const key = parseLocalAlbumId(id);
  if (key == null) throw new LocalUnsupportedError(`album id "${id}"`);
  const [aggregate, tracks] = await Promise.all([
    queryAlbumByKey(key),
    queryAlbumTracksByKey(key),
  ]);
  if (!aggregate)
    throw new LocalUnsupportedError(`album "${id}" (not indexed)`);
  const album: AlbumWithSongsID3 = {
    ...mapAggToAlbum(aggregate),
    song: tracks.map(mapRowToChild),
  };
  return localEnvelope({ album });
};

export const getSong = async (id: string) => {
  const row = await queryTrackById(id);
  if (!row) throw new LocalUnsupportedError(`song "${id}" (not indexed)`);
  return localEnvelope({ song: mapRowToChild(row) });
};

// `artist` is the display name; its artist_key is normalizeKey(albumArtist ||
// artist) at index time, so normalizing the name recovers the same key.
export const getTopSongs = async (
  artist: string,
  { count }: { count?: number } = {},
) => {
  const rows = await queryTopSongsByArtist(normalizeKey(artist), count ?? 50);
  return localEnvelope({ topSongs: { song: rows.map(mapRowToChild) } });
};

export const getGenres = async () => {
  const rows = await queryGenres();
  return localEnvelope({ genres: { genre: rows.map(mapGenreRow) } });
};
