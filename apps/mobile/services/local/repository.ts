import { getLocalLibraryDb, type PlaylistRow, type TrackRow } from "./db";

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

export async function queryArtistByKey(
  key: string,
): Promise<ArtistAggRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<ArtistAggRow>(
    `SELECT
       artist_key,
       COALESCE(MAX(album_artist), MAX(artist)) AS name,
       COUNT(DISTINCT album_key) AS album_count,
       MAX(artwork_path) AS cover
     FROM tracks
     WHERE artist_key = ?
     GROUP BY artist_key`,
    key,
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

// --- playlists -------------------------------------------------------------

// A playlist plus its rolled-up song count / duration / first-track cover. The
// joins exclude dangling entries (track pruned from the index) so `song_count`
// always matches what `queryPlaylistEntries` returns.
export type PlaylistAggRow = PlaylistRow & {
  song_count: number;
  duration_ms: number | null;
  cover: string | null;
};

const PLAYLIST_AGG_SELECT = `
  SELECT
    p.id, p.name, p.comment, p.created_at, p.changed_at,
    COUNT(t.id) AS song_count,
    COALESCE(SUM(t.duration_ms), 0) AS duration_ms,
    (SELECT t2.artwork_path
       FROM playlist_tracks pt2
       JOIN tracks t2 ON t2.id = pt2.track_id
      WHERE pt2.playlist_id = p.id
      ORDER BY pt2.position ASC
      LIMIT 1) AS cover
  FROM playlists p
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
  LEFT JOIN tracks t ON t.id = pt.track_id`;

export async function queryPlaylists(): Promise<PlaylistAggRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<PlaylistAggRow>(
    `${PLAYLIST_AGG_SELECT}
     GROUP BY p.id
     ORDER BY p.name COLLATE NOCASE ASC`,
  );
}

export async function queryPlaylistById(
  id: string,
): Promise<PlaylistAggRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<PlaylistAggRow>(
    `${PLAYLIST_AGG_SELECT} WHERE p.id = ? GROUP BY p.id`,
    id,
  );
}

/** Resolvable tracks of a playlist, in stored order (dangling rows skipped). */
export async function queryPlaylistEntries(id: string): Promise<TrackRow[]> {
  const db = await getLocalLibraryDb();
  const projected = TRACK_COLUMNS.split(", ")
    .map((c) => `t.${c}`)
    .join(", ");
  return db.getAllAsync<TrackRow>(
    `SELECT ${projected}
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
    id,
  );
}

export async function insertPlaylist(p: {
  id: string;
  name: string;
  comment?: string;
  now: number;
  trackIds: string[];
}): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO playlists (id, name, comment, created_at, changed_at)
       VALUES (?, ?, ?, ?, ?)`,
      p.id,
      p.name,
      p.comment ?? null,
      p.now,
      p.now,
    );
    await insertTracksAtEnd(db, p.id, p.trackIds);
  });
}

export async function updatePlaylistMeta(
  id: string,
  fields: { name?: string; comment?: string },
  now: number,
): Promise<void> {
  if (fields.name === undefined && fields.comment === undefined) return;
  const db = await getLocalLibraryDb();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    args.push(fields.name);
  }
  if (fields.comment !== undefined) {
    sets.push("comment = ?");
    args.push(fields.comment);
  }
  sets.push("changed_at = ?");
  args.push(now, id);
  await db.runAsync(
    `UPDATE playlists SET ${sets.join(", ")} WHERE id = ?`,
    args,
  );
}

export async function appendPlaylistTracks(
  id: string,
  trackIds: string[],
  now: number,
): Promise<void> {
  if (trackIds.length === 0) return;
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    await insertTracksAtEnd(db, id, trackIds);
    await db.runAsync(
      "UPDATE playlists SET changed_at = ? WHERE id = ?",
      now,
      id,
    );
  });
}

/**
 * Remove entries by their ordinal index in the resolvable (display) order —
 * matching Subsonic's `songIndexToRemove`. Positions are then re-compacted to
 * 0..n-1 so subsequent index-based edits stay correct.
 */
export async function removePlaylistIndexes(
  id: string,
  indexes: number[],
  now: number,
): Promise<void> {
  if (indexes.length === 0) return;
  const db = await getLocalLibraryDb();
  const drop = new Set(indexes);
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ position: number }>(
      `SELECT pt.position
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC`,
      id,
    );
    const positions = rows.filter((_, i) => drop.has(i)).map((r) => r.position);
    for (const position of positions) {
      await db.runAsync(
        "DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?",
        id,
        position,
      );
    }
    await resequencePlaylist(db, id);
    await db.runAsync(
      "UPDATE playlists SET changed_at = ? WHERE id = ?",
      now,
      id,
    );
  });
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM playlist_tracks WHERE playlist_id = ?", id);
    await db.runAsync("DELETE FROM playlists WHERE id = ?", id);
  });
}

type Db = Awaited<ReturnType<typeof getLocalLibraryDb>>;

/** Append tracks after the current last position (caller owns the txn). */
async function insertTracksAtEnd(
  db: Db,
  id: string,
  trackIds: string[],
): Promise<void> {
  if (trackIds.length === 0) return;
  const max = await db.getFirstAsync<{ max: number | null }>(
    "SELECT MAX(position) AS max FROM playlist_tracks WHERE playlist_id = ?",
    id,
  );
  let position = (max?.max ?? -1) + 1;
  for (const trackId of trackIds) {
    await db.runAsync(
      "INSERT INTO playlist_tracks (playlist_id, position, track_id) VALUES (?, ?, ?)",
      id,
      position,
      trackId,
    );
    position++;
  }
}

/** Re-number a playlist's positions to a contiguous 0..n-1 (caller owns txn). */
async function resequencePlaylist(db: Db, id: string): Promise<void> {
  const rows = await db.getAllAsync<{ position: number }>(
    "SELECT position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC",
    id,
  );
  // Ascending order with downward compaction never collides with the UNIQUE
  // (playlist_id, position) constraint: each target i ≤ its source position and
  // slot i is already vacated by the time we reach it.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].position !== i) {
      await db.runAsync(
        "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND position = ?",
        i,
        id,
        rows[i].position,
      );
    }
  }
}
