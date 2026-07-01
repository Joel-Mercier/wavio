import {
  normalizeKey,
  parseLocalAlbumId,
  parseLocalArtistId,
} from "@/services/local/keys";
import { unknownAlbumLabel, unknownArtistLabel } from "@/services/local/labels";
import {
  buildArtistIndex,
  mapAggToAlbum,
  mapAggToArtist,
  mapGenreRow,
  mapRowToChild,
} from "@/services/local/mappers";
import { folderLabel, localFolders } from "@/services/local/paths";
import {
  queryAlbumByKey,
  queryAlbumTracksByKey,
  queryArtistAlbumsByKey,
  queryArtistByKey,
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
  AlbumID3,
  AlbumWithSongsID3,
  ArtistWithAlbumsID3,
  Child,
  Directory,
  Index,
  Indexes,
  MusicFolder,
  SimilarSongs2,
} from "@/services/openSubsonic/types";

export const getMusicFolders = async () => {
  const musicFolder: MusicFolder[] = localFolders().map((path) => ({
    id: path,
    name: folderLabel(path),
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

// Folder-style browsing (FolderDetail) walks the same artist → album → song
// hierarchy the rest of the local backend exposes, just shaped as nested
// Directory/Child envelopes: an artist id resolves to its albums (as
// subdirectories) and an album id to its songs. Without this, the on-device
// library throws localUnsupported() the moment you tap into a folder entry.
const albumToDirChild = (album: AlbumID3, parent: string): Child => ({
  id: album.id,
  parent,
  isDir: true,
  title: album.name,
  name: album.name,
  album: album.name,
  albumId: album.id,
  artist: album.artist,
  artistId: album.artistId,
  coverArt: album.coverArt,
  duration: album.duration,
  year: album.year,
  created: album.created,
  starred: album.starred,
  userRating: album.userRating,
  playCount: album.playCount,
  played: album.played,
});

export const getMusicDirectory = async (id: string) => {
  const artistKey = parseLocalArtistId(id);
  if (artistKey != null) {
    const [artistRow, albumRows] = await Promise.all([
      queryArtistByKey(artistKey),
      queryArtistAlbumsByKey(artistKey),
    ]);
    const directory: Directory = {
      id,
      name: artistRow?.name ?? unknownArtistLabel(),
      child: albumRows.map((row) => albumToDirChild(mapAggToAlbum(row), id)),
    };
    return localEnvelope({ directory });
  }
  const albumKey = parseLocalAlbumId(id);
  if (albumKey != null) {
    const [aggregate, tracks] = await Promise.all([
      queryAlbumByKey(albumKey),
      queryAlbumTracksByKey(albumKey),
    ]);
    const directory: Directory = {
      id,
      name: aggregate?.name ?? unknownAlbumLabel(),
      child: tracks.map(mapRowToChild),
    };
    return localEnvelope({ directory });
  }
  throw new LocalUnsupportedError(`directory id "${id}"`);
};

export const getArtist = async (id: string) => {
  const key = parseLocalArtistId(id);
  if (key == null) throw new LocalUnsupportedError(`artist id "${id}"`);
  const albumRows = await queryArtistAlbumsByKey(key);
  const albums = albumRows.map(mapAggToAlbum);
  const artist: ArtistWithAlbumsID3 = {
    id,
    name:
      albumRows[0]?.album_artist ??
      albumRows[0]?.artist ??
      unknownArtistLabel(),
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

// The on-device index has no acoustic-similarity model, so "similar songs" is
// a best-effort surface: the seed artist's other most-played tracks (the same
// ranking getTopSongs uses), excluding the seed itself. Without this, local
// libraries hit localUnsupported() here and endless playback could only ever
// fall back to getTopSongs at the call site.
export const getSimilarSongs2 = async (
  id: string,
  { count }: { count?: number } = {},
) => {
  const limit = count ?? 20;
  const seed = await queryTrackById(id);
  const song: Child[] = [];
  if (seed?.artist_key) {
    const rows = await queryTopSongsByArtist(seed.artist_key, limit + 1);
    song.push(
      ...rows
        .filter((row) => row.id !== id)
        .slice(0, limit)
        .map(mapRowToChild),
    );
  }
  const similarSongs2: SimilarSongs2 = { song };
  return localEnvelope({ similarSongs2 });
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

// The on-device index has no notion of "appearances" (albums where an artist
// features without being the album artist). Return an empty list so the Artist
// screen simply omits the section instead of hitting localUnsupported().
export const getArtistAppearances = async (
  _id: string,
  _opts: { name?: string; musicFolderId?: string } = {},
) => {
  const album: AlbumID3[] = [];
  return localEnvelope({ artistAppearances: { album } });
};
