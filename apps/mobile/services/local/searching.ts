import type { TrackRow } from "@/services/local/db";
import { localAlbumId, localArtistId } from "@/services/local/keys";
import { unknownAlbumLabel, unknownArtistLabel } from "@/services/local/labels";
import { mapRowToChild } from "@/services/local/mappers";
import { searchTracks } from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type {
  AlbumID3,
  Artist,
  ArtistID3,
  Child,
  SearchResult,
  SearchResult2,
  SearchResult3,
} from "@/services/openSubsonic/types";

type SearchOpts = {
  artistCount?: number;
  artistOffset?: number;
  albumCount?: number;
  albumOffset?: number;
  songCount?: number;
  songOffset?: number;
  musicFolderId?: string;
};

// FTS5 matches at the track level; roll the matching tracks up into deduped
// album and artist buckets (capped by the requested counts).
function rollUp(rows: TrackRow[], opts: SearchOpts) {
  const albums = new Map<string, AlbumID3>();
  const artists = new Map<string, ArtistID3>();
  for (const row of rows) {
    if (row.album_key?.trim() && !albums.has(row.album_key)) {
      albums.set(row.album_key, {
        id: localAlbumId(row.album_key),
        name: row.album ?? unknownAlbumLabel(),
        artist: row.album_artist ?? row.artist ?? undefined,
        artistId: row.artist_key ? localArtistId(row.artist_key) : undefined,
        coverArt: row.artwork_path ?? undefined,
        created: new Date(row.indexed_at),
        duration: 0,
        songCount: 0,
        year: row.year ?? undefined,
      });
    }
    if (row.artist_key && !artists.has(row.artist_key)) {
      artists.set(row.artist_key, {
        id: localArtistId(row.artist_key),
        name: row.album_artist ?? row.artist ?? unknownArtistLabel(),
        albumCount: 0,
        coverArt: row.artwork_path ?? undefined,
      });
    }
  }
  return {
    albums: [...albums.values()].slice(0, opts.albumCount ?? 20),
    artists: [...artists.values()].slice(0, opts.artistCount ?? 20),
  };
}

export const search3 = async (query: string, opts: SearchOpts = {}) => {
  const rows = await searchTracks(
    query,
    opts.songCount ?? 20,
    opts.songOffset ?? 0,
  );
  const { albums, artists } = rollUp(rows, opts);
  const searchResult3: SearchResult3 = {
    album: albums,
    artist: artists,
    song: rows.map(mapRowToChild),
  };
  return localEnvelope({ searchResult3 });
};

export const search2 = async (query: string, opts: SearchOpts = {}) => {
  const rows = await searchTracks(
    query,
    opts.songCount ?? 20,
    opts.songOffset ?? 0,
  );
  const { albums, artists } = rollUp(rows, opts);
  // search2 uses the lighter Directory/Artist shapes.
  const albumDirs: Child[] = albums.map((a) => ({
    id: a.id,
    isDir: true,
    title: a.name,
    album: a.name,
    artist: a.artist,
    coverArt: a.coverArt,
    year: a.year,
  }));
  const artistEntries: Artist[] = artists.map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const searchResult2: SearchResult2 = {
    album: albumDirs,
    artist: artistEntries,
    song: rows.map(mapRowToChild),
  };
  return localEnvelope({ searchResult2 });
};

export const search = async (_opts: {
  artist?: string;
  album?: string;
  title?: string;
  any?: string;
  count?: number;
  offset?: number;
  newerThan?: number;
}) => {
  // Legacy ID-less search; not surfaced by the local UI.
  const searchResult: SearchResult = { offset: 0, totalHits: 0, match: [] };
  return localEnvelope({ searchResult });
};
