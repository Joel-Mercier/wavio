import {
  getLocalLibraryDb,
  type PlaylistRow,
  type PodcastChannelRow,
  type PodcastEpisodeRow,
  type RadioStationRow,
  type TrackRow,
} from "./db";

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

// Track reads alias the table as `t` and LEFT JOIN per-track play stats so every
// mapped Child can carry its playCount / played (see mappers.ts). play_count
// defaults to 0 and last_played_at is null for never-played tracks.
const STATS_JOIN = "LEFT JOIN track_stats s ON s.track_id = t.id";
const TRACK_PROJECTION = `${TRACK_COLUMNS.split(", ")
  .map((c) => `t.${c}`)
  .join(
    ", ",
  )}, COALESCE(s.play_count, 0) AS play_count, s.last_played_at AS last_played_at`;
const TRACK_SELECT = `SELECT ${TRACK_PROJECTION} FROM tracks t ${STATS_JOIN}`;

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
  release_types_json: string | null;
  indexed_at: number;
  // Rolled up from track_stats across the album's tracks.
  play_count: number;
  last_played_at: number | null;
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

// track_stats joins 1:0-or-1 (its PK is track_id), so COUNT(*)/SUM(duration_ms)
// still count each track once; play_count rolls up as a sum and last_played_at
// as the most recent across the album's tracks.
const ALBUM_SELECT = `
  SELECT
    t.album_key AS album_key,
    MAX(t.album) AS name,
    MAX(t.album_artist) AS album_artist,
    MAX(t.artist) AS artist,
    MAX(t.artist_key) AS artist_key,
    COUNT(*) AS song_count,
    SUM(t.duration_ms) AS duration_ms,
    MIN(t.year) AS year,
    MAX(t.artwork_path) AS cover,
    MAX(t.is_compilation) AS is_compilation,
    MAX(t.music_brainz_id) AS music_brainz_id,
    MAX(t.release_types_json) AS release_types_json,
    MAX(t.indexed_at) AS indexed_at,
    SUM(COALESCE(s.play_count, 0)) AS play_count,
    MAX(s.last_played_at) AS last_played_at
  FROM tracks t ${STATS_JOIN}`;

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

/** Total bytes of every indexed file — the on-disk size of the imported library. */
export async function queryLibrarySize(): Promise<number> {
  const db = await getLocalLibraryDb();
  const row = await db.getFirstAsync<{ bytes: number | null }>(
    "SELECT SUM(size) AS bytes FROM tracks",
  );
  return row?.bytes ?? 0;
}

export async function queryTrackById(id: string): Promise<TrackRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<TrackRow>(`${TRACK_SELECT} WHERE t.id = ?`, id);
}

/**
 * An artist's tracks ordered by play count (most-played first), used for the
 * "Top songs" surface. Mirrors Subsonic's getTopSongs; ties break on title.
 */
export async function queryTopSongsByArtist(
  artistKey: string,
  limit: number,
): Promise<TrackRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `${TRACK_SELECT}
     WHERE t.artist_key = ?
     ORDER BY play_count DESC, t.title COLLATE NOCASE ASC
     LIMIT ?`,
    artistKey,
    limit,
  );
}

/**
 * The globally most-played tracks (most-played first), for the "Most played
 * tracks" home surface. Unplayed tracks are excluded (play_count > 0); ties
 * break on title. Paginated via limit/offset.
 */
export async function queryTopSongs(
  limit: number,
  offset: number,
): Promise<TrackRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `${TRACK_SELECT}
     WHERE play_count > 0
     ORDER BY play_count DESC, t.title COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
}

export async function queryAlbumTracksByKey(key: string): Promise<TrackRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `${TRACK_SELECT}
     WHERE t.album_key = ?
     ORDER BY t.disc_number ASC, t.track_number ASC, t.title COLLATE NOCASE ASC`,
    key,
  );
}

/**
 * Record one play of a track: increment its count and advance last_played_at.
 * `playedAt` is epoch-ms (the scrobble's start time). A single upsert keeps the
 * playback hot-path cheap. Called from the local scrobble on a real submission.
 */
export async function recordPlay(
  trackId: string,
  playedAt: number,
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `INSERT INTO track_stats (track_id, play_count, last_played_at)
     VALUES (?, 1, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       play_count = play_count + 1,
       last_played_at = MAX(COALESCE(last_played_at, 0), excluded.last_played_at)`,
    trackId,
    playedAt,
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
    where.push("t.genre = ? COLLATE NOCASE");
    params.push(genre);
  }
  if (fromYear != null) {
    where.push("t.year >= ?");
    params.push(fromYear);
  }
  if (toYear != null) {
    where.push("t.year <= ?");
    params.push(toYear);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = random
    ? "ORDER BY RANDOM()"
    : "ORDER BY t.title COLLATE NOCASE ASC";
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackRow>(
    `${TRACK_SELECT} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
}

export type AlbumOrder =
  | "name"
  | "artist"
  | "year"
  | "recent"
  | "random"
  // Play-stats orders: "plays" = most played (frequent), "played" = most
  // recently played (recent). Both filter out albums with no plays via HAVING.
  | "plays"
  | "played";

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
  plays: "play_count DESC, last_played_at DESC",
  played: "last_played_at DESC",
};

// HAVING for the play-stats orders so unplayed albums are excluded (the
// "frequent"/"recent" home sections should be empty — and thus auto-hidden —
// until something has actually been played).
const ALBUM_HAVING_SQL: Partial<Record<AlbumOrder, string>> = {
  plays: "HAVING play_count > 0",
  played: "HAVING last_played_at IS NOT NULL",
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
     ${ALBUM_HAVING_SQL[order] ?? ""}
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
  return db.getAllAsync<TrackRow>(
    `SELECT ${TRACK_PROJECTION}
     FROM tracks_fts f
     JOIN tracks t ON t.id = f.id
     ${STATS_JOIN}
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
  return db.getAllAsync<TrackRow>(
    `SELECT ${TRACK_PROJECTION}
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     ${STATS_JOIN}
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

// --- internet radio stations ----------------------------------------------

export async function queryRadioStations(): Promise<RadioStationRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<RadioStationRow>(
    "SELECT * FROM internet_radio_stations ORDER BY name COLLATE NOCASE ASC",
  );
}

export async function insertRadioStation(row: RadioStationRow): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `INSERT INTO internet_radio_stations (id, name, stream_url, home_page_url, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    row.id,
    row.name,
    row.stream_url,
    row.home_page_url,
    row.created_at,
  );
}

export async function updateRadioStation(
  id: string,
  fields: { name: string; stream_url: string; home_page_url: string | null },
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `UPDATE internet_radio_stations
     SET name = ?, stream_url = ?, home_page_url = ?
     WHERE id = ?`,
    fields.name,
    fields.stream_url,
    fields.home_page_url,
    id,
  );
}

export async function deleteRadioStation(id: string): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync("DELETE FROM internet_radio_stations WHERE id = ?", id);
}

// --- podcasts --------------------------------------------------------------

export async function queryPodcastChannels(): Promise<PodcastChannelRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<PodcastChannelRow>(
    "SELECT * FROM podcast_channels ORDER BY title COLLATE NOCASE ASC",
  );
}

export async function queryPodcastChannelById(
  id: string,
): Promise<PodcastChannelRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<PodcastChannelRow>(
    "SELECT * FROM podcast_channels WHERE id = ?",
    id,
  );
}

/** Channel id of the channel a given feed url belongs to, if already added. */
export async function queryPodcastChannelByUrl(
  url: string,
): Promise<PodcastChannelRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<PodcastChannelRow>(
    "SELECT * FROM podcast_channels WHERE url = ?",
    url,
  );
}

export async function queryPodcastEpisodesByChannel(
  channelId: string,
): Promise<PodcastEpisodeRow[]> {
  const db = await getLocalLibraryDb();
  // Newest first; episodes without a publish date sort last.
  return db.getAllAsync<PodcastEpisodeRow>(
    `SELECT * FROM podcast_episodes
     WHERE channel_id = ?
     ORDER BY publish_date DESC NULLS LAST, created_at DESC`,
    channelId,
  );
}

export async function queryPodcastEpisodesByChannelIds(
  channelIds: string[],
): Promise<PodcastEpisodeRow[]> {
  if (channelIds.length === 0) return [];
  const db = await getLocalLibraryDb();
  const placeholders = channelIds.map(() => "?").join(", ");
  return db.getAllAsync<PodcastEpisodeRow>(
    `SELECT * FROM podcast_episodes
     WHERE channel_id IN (${placeholders})
     ORDER BY publish_date DESC NULLS LAST, created_at DESC`,
    ...channelIds,
  );
}

export async function queryPodcastEpisodeById(
  id: string,
): Promise<PodcastEpisodeRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<PodcastEpisodeRow>(
    "SELECT * FROM podcast_episodes WHERE id = ?",
    id,
  );
}

export async function insertPodcastChannel(
  row: PodcastChannelRow,
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `INSERT INTO podcast_channels
       (id, url, title, description, author, original_image_url, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.url,
    row.title,
    row.description,
    row.author,
    row.original_image_url,
    row.status,
    row.error_message,
    row.created_at,
    row.updated_at,
  );
}

export async function updatePodcastChannelMeta(
  id: string,
  fields: {
    title: string | null;
    description: string | null;
    author: string | null;
    original_image_url: string | null;
    status: string;
    error_message: string | null;
    updated_at: number;
  },
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `UPDATE podcast_channels
     SET title = ?, description = ?, author = ?, original_image_url = ?, status = ?, error_message = ?, updated_at = ?
     WHERE id = ?`,
    fields.title,
    fields.description,
    fields.author,
    fields.original_image_url,
    fields.status,
    fields.error_message,
    fields.updated_at,
    id,
  );
}

export async function updatePodcastChannelStatus(
  id: string,
  fields: {
    status: string;
    error_message: string | null;
    updated_at: number;
  },
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `UPDATE podcast_channels
     SET status = ?, error_message = ?, updated_at = ?
     WHERE id = ?`,
    fields.status,
    fields.error_message,
    fields.updated_at,
    id,
  );
}

/**
 * Insert (or update in place) a channel's episodes. Keyed on the episode `id`,
 * which encodes the enclosure URL (see keys.ts), so re-parsing a feed refreshes
 * existing episodes rather than duplicating them. Newly-removed feed entries are
 * left in place (mirrors how a Subsonic server keeps already-downloaded
 * episodes); a deleted episode is only gone when the user deletes it.
 */
export async function upsertPodcastEpisodes(
  rows: PodcastEpisodeRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO podcast_episodes
           (id, channel_id, guid, title, description, publish_date, duration, suffix, content_type, size, stream_url, original_image_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           guid = excluded.guid,
           title = excluded.title,
           description = excluded.description,
           publish_date = excluded.publish_date,
           duration = excluded.duration,
           suffix = excluded.suffix,
           content_type = excluded.content_type,
           size = excluded.size,
           original_image_url = excluded.original_image_url`,
        row.id,
        row.channel_id,
        row.guid,
        row.title,
        row.description,
        row.publish_date,
        row.duration,
        row.suffix,
        row.content_type,
        row.size,
        row.stream_url,
        row.original_image_url,
        row.created_at,
      );
    }
  });
}

export async function deletePodcastChannel(id: string): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM podcast_episodes WHERE channel_id = ?", id);
    await db.runAsync("DELETE FROM podcast_channels WHERE id = ?", id);
  });
}

export async function deletePodcastEpisode(id: string): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync("DELETE FROM podcast_episodes WHERE id = ?", id);
}
