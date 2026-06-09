import { getLocalLibraryDb, type TrackRow } from "./db";

// Data-access layer for the local backend: raw SQLite reads returning row
// shapes. The section files (browsing/lists/searching/…) call these and adapt
// the rows to OpenSubsonic envelope shapes via mappers.ts. This is the SQLite
// analogue of the axios calls in the services/jellyfin/* section files.

const TRACK_COLUMNS =
  "id, uri, path, folder, size, mtime, title, artist, album, album_artist, " +
  "composer, genre, year, track_number, track_total, disc_number, disc_total, " +
  "duration_ms, bitrate, sample_rate, is_compilation, suffix, artwork_path, " +
  "artwork_mime, lyrics, music_brainz_id, artists_json, replay_gain_json, " +
  "album_key, artist_key, indexed_at";

// One row per album, aggregated across its tracks.
export type AlbumAggRow = {
  album_key: string;
  name: string | null;
  album_artist: string | null;
  artist: string | null;
  artist_key: string | null;
  song_count: number;
  duration_ms: number | null;
  year: number | null;
  cover: string | null;
  is_compilation: number;
  music_brainz_id: string | null;
  indexed_at: number;
};

export type ArtistAggRow = {
  artist_key: string;
  name: string | null;
  album_count: number;
  cover: string | null;
};

export type GenreRow = {
  value: string;
  album_count: number;
  song_count: number;
};

const ALBUM_SELECT = `
  SELECT
    album_key,
    MAX(album) AS name,
    MAX(album_artist) AS album_artist,
    MAX(artist) AS artist,
    MAX(artist_key) AS artist_key,
    COUNT(*) AS song_count,
    SUM(duration_ms) AS duration_ms,
    MIN(year) AS year,
    MAX(artwork_path) AS cover,
    MAX(is_compilation) AS is_compilation,
    MAX(music_brainz_id) AS music_brainz_id,
    MAX(indexed_at) AS indexed_at
  FROM tracks`;

export type LibraryStats = {
  trackCount: number;
  albumCount: number;
  artistCount: number;
};

export async function queryStats(): Promise<LibraryStats> {
  const db = await getLocalLibraryDb();
  const row = await db.getFirstAsync<LibraryStats>(
    `SELECT
       COUNT(*) AS trackCount,
       COUNT(DISTINCT album_key) AS albumCount,
       COUNT(DISTINCT artist_key) AS artistCount
     FROM tracks`,
  );
  return row ?? { trackCount: 0, albumCount: 0, artistCount: 0 };
}

export async function queryTrackById(id: string): Promise<TrackRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ?`,
    id,
  );
}

export async function queryAlbumTracksByKey(key: string): Promise<TrackRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks
     WHERE album_key = ?
     ORDER BY disc_number ASC, track_number ASC, title COLLATE NOCASE ASC`,
    key,
  );
}

export type SongFilter = {
  limit?: number;
  offset?: number;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  random?: boolean;
};

export async function querySongs(filter: SongFilter = {}): Promise<TrackRow[]> {
  const { limit = 100, offset = 0, genre, fromYear, toYear, random } = filter;
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (genre) {
    where.push("genre = ? COLLATE NOCASE");
    params.push(genre);
  }
  if (fromYear != null) {
    where.push("year >= ?");
    params.push(fromYear);
  }
  if (toYear != null) {
    where.push("year <= ?");
    params.push(toYear);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = random
    ? "ORDER BY RANDOM()"
    : "ORDER BY title COLLATE NOCASE ASC";
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
}

export type AlbumOrder = "name" | "artist" | "year" | "recent" | "random";

export type AlbumFilter = {
  order?: AlbumOrder;
  limit?: number;
  offset?: number;
  genre?: string;
  fromYear?: number;
  toYear?: number;
};

const ALBUM_ORDER_SQL: Record<AlbumOrder, string> = {
  name: "name COLLATE NOCASE ASC",
  artist: "album_artist COLLATE NOCASE ASC, name COLLATE NOCASE ASC",
  year: "year ASC, name COLLATE NOCASE ASC",
  recent: "indexed_at DESC",
  random: "RANDOM()",
};

export async function queryAlbums(
  filter: AlbumFilter = {},
): Promise<AlbumAggRow[]> {
  const {
    order = "name",
    limit = 100,
    offset = 0,
    genre,
    fromYear,
    toYear,
  } = filter;
  // Album-level keys are blank for tag-less files; never surface those as albums.
  const where: string[] = ["album_key != ' '"];
  const params: (string | number)[] = [];
  if (genre) {
    where.push("genre = ? COLLATE NOCASE");
    params.push(genre);
  }
  if (fromYear != null) {
    where.push("year >= ?");
    params.push(fromYear);
  }
  if (toYear != null) {
    where.push("year <= ?");
    params.push(toYear);
  }
  const db = await getLocalLibraryDb();
  return db.getAllAsync<AlbumAggRow>(
    `${ALBUM_SELECT}
     WHERE ${where.join(" AND ")}
     GROUP BY album_key
     ORDER BY ${ALBUM_ORDER_SQL[order]}
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
}

export async function queryAlbumByKey(
  key: string,
): Promise<AlbumAggRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<AlbumAggRow>(
    `${ALBUM_SELECT} WHERE album_key = ? GROUP BY album_key`,
    key,
  );
}

export async function queryArtistAlbumsByKey(
  key: string,
): Promise<AlbumAggRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<AlbumAggRow>(
    `${ALBUM_SELECT}
     WHERE artist_key = ?
     GROUP BY album_key
     ORDER BY year ASC, name COLLATE NOCASE ASC`,
    key,
  );
}

export async function queryArtists(): Promise<ArtistAggRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<ArtistAggRow>(
    `SELECT
       artist_key,
       COALESCE(MAX(album_artist), MAX(artist)) AS name,
       COUNT(DISTINCT album_key) AS album_count,
       MAX(artwork_path) AS cover
     FROM tracks
     WHERE artist_key != ''
     GROUP BY artist_key
     ORDER BY name COLLATE NOCASE ASC`,
  );
}

export async function queryGenres(): Promise<GenreRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<GenreRow>(
    `SELECT
       genre AS value,
       COUNT(DISTINCT album_key) AS album_count,
       COUNT(*) AS song_count
     FROM tracks
     WHERE genre IS NOT NULL AND genre != ''
     GROUP BY genre COLLATE NOCASE
     ORDER BY value COLLATE NOCASE ASC`,
  );
}

export async function searchTracks(
  query: string,
  limit: number,
  offset = 0,
): Promise<TrackRow[]> {
  const match = toFtsQuery(query);
  if (!match) return [];
  const db = await getLocalLibraryDb();
  const projected = TRACK_COLUMNS.split(", ")
    .map((c) => `t.${c}`)
    .join(", ");
  return db.getAllAsync<TrackRow>(
    `SELECT ${projected}
     FROM tracks_fts f
     JOIN tracks t ON t.id = f.id
     WHERE tracks_fts MATCH ?
     ORDER BY rank
     LIMIT ? OFFSET ?`,
    match,
    limit,
    offset,
  );
}

/**
 * Build a safe FTS5 MATCH expression from free user input: split on whitespace,
 * strip FTS operators, and make each token a quoted prefix term. Returns null
 * when nothing usable remains.
 */
function toFtsQuery(query: string): string | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["*()^:]/g, "").trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"*`);
  return tokens.length ? tokens.join(" ") : null;
}
