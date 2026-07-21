import {
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import { localTrackId } from "@/services/local/keys";
import { currentAuthScope } from "@/stores/auth";
import { logError } from "@/utils/log";

// Per-(server, user) on-device index for the local-library feature. SQLite (not
// MMKV) so the catalog can be queried, grouped and full-text searched at scale —
// a few thousand local tracks would be unwieldy as a single JSON blob.
//
// The index is scoped exactly like the rest of the app's persisted state: a
// separate physical database file per `currentAuthScope()`, so switching servers
// never mixes one account's local library into another's. The handle follows the
// active scope automatically (see `getLocalLibraryDb`).

const SCHEMA_VERSION = 6;

const currentScope = currentAuthScope;

// `getAuthScope` sanitizes to [A-Za-z0-9_], so the scope is a safe filename
// fragment.
//
// Despite the name, this file is not only the local library's: it also holds the
// on-device podcast store that Navidrome and Jellyfin fall back to (see
// services/backend/podcasts.ts), so it is keyed by a *remote* server's scope too
// — not just the fixed `local_local` sentinel. Any change to how a scope is
// derived therefore has to move these files, or the data is orphaned under the
// old name (see migrateLocalLibraryDatabases in services/storageScopeMigration).
const dbNameForScope = (scope: string): string => `local-library-${scope}.db`;

// Open handle, memoized per scope. We keep the *promise* so a burst of callers
// in the same scope shares one open, and a scope change chains the previous
// handle's close before opening the new file.
let current: { scope: string; db: Promise<SQLiteDatabase> } | null = null;

/**
 * Resolve the SQLite database for the active (server, user) scope, opening (and
 * migrating) it on first use and transparently swapping to a new file when the
 * scope changes. Always `await getLocalLibraryDb()` at call time — never cache
 * the resolved handle across an await that might span a server switch.
 */
export function getLocalLibraryDb(): Promise<SQLiteDatabase> {
  const scope = currentScope();
  if (current?.scope === scope) return current.db;

  const previous = current;
  current = {
    scope,
    db: (async () => {
      if (previous) {
        try {
          const old = await previous.db;
          await old.closeAsync();
        } catch (error) {
          logError("[localLibrary] Failed to close previous database", error);
        }
      }
      const db = await openDatabaseAsync(dbNameForScope(scope));
      // WAL must be set outside any transaction; do it before migrating.
      await db.execAsync("PRAGMA journal_mode = WAL");
      await migrate(db);
      return db;
    })(),
  };
  return current.db;
}

/**
 * Close the active scope's handle (if any). Call on sign-out so a later login
 * re-opens cleanly; safe to call when nothing is open.
 */
export async function closeLocalLibraryDb(): Promise<void> {
  const open = current;
  current = null;
  if (!open) return;
  try {
    const db = await open.db;
    await db.closeAsync();
  } catch (error) {
    logError("[localLibrary] Failed to close database", error);
  }
}

/**
 * Drop the active scope's entire on-device index (and its file). Used by a
 * "clear local library" action. Re-opens lazily on the next query.
 */
export async function deleteLocalLibraryDb(): Promise<void> {
  const scope = currentScope();
  await closeLocalLibraryDb();
  try {
    await deleteDatabaseAsync(dbNameForScope(scope));
  } catch (error) {
    logError("[localLibrary] Failed to delete database", error);
  }
}

// --- schema / migrations ---------------------------------------------------

// Columns map onto the OpenSubsonic `Child` shape (see queries.ts) so the rest
// of the app stays protocol-agnostic. `*_key` columns hold normalized grouping
// keys (indexed) so album/artist rollups don't pay a per-row normalize cost.
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS tracks (
  id            TEXT PRIMARY KEY NOT NULL,
  uri           TEXT NOT NULL UNIQUE,
  path          TEXT,
  folder        TEXT,
  size          INTEGER,
  mtime         INTEGER,
  title         TEXT,
  artist        TEXT,
  album         TEXT,
  album_artist  TEXT,
  composer      TEXT,
  genre         TEXT,
  year          INTEGER,
  track_number  INTEGER,
  track_total   INTEGER,
  disc_number   INTEGER,
  disc_total    INTEGER,
  duration_ms   INTEGER,
  bitrate       INTEGER,
  sample_rate   INTEGER,
  is_compilation INTEGER NOT NULL DEFAULT 0,
  suffix        TEXT,
  artwork_path  TEXT,
  artwork_mime  TEXT,
  lyrics        TEXT,
  music_brainz_id TEXT,
  artists_json  TEXT,
  replay_gain_json TEXT,
  release_types_json TEXT,
  album_key     TEXT,
  artist_key    TEXT,
  indexed_at    INTEGER NOT NULL
);
-- This table deliberately carries no secondary indexes: every read goes through
-- the tracks_resolved view, which seeks on the resolved_* columns instead (see
-- SCHEMA_V6). The scanned album_key/artist_key/genre/title columns are only
-- ever read as fallback values, never used as predicates, so indexing them
-- bought nothing and cost four b-tree updates per indexed track.
--
-- Don't re-add one here without also removing its DROP from SCHEMA_V6: both
-- blocks run on every open, so a CREATE here and a DROP there would rebuild and
-- discard the whole index every time the database is opened.

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  id UNINDEXED,
  title,
  artist,
  album,
  album_artist
);
`;

// User-created playlists live on-device too (the local backend has no server to
// store them). `playlist_tracks.position` is kept contiguous 0..n-1 so a song's
// ordinal index — what Subsonic's `songIndexToRemove` addresses — maps straight
// to its row. Track membership references `tracks.id` but is *not* FK-enforced:
// a file pruned on rescan leaves a dangling row that read queries skip (and that
// re-resolves if the file returns, since track ids are derived from the URI).
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS playlists (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  comment     TEXT,
  created_at  INTEGER NOT NULL,
  changed_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  position    INTEGER NOT NULL,
  track_id    TEXT NOT NULL,
  PRIMARY KEY (playlist_id, position)
);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pid
  ON playlist_tracks(playlist_id, position);
`;

// Per-track play statistics (the local-backend analogue of Subsonic's
// playCount / played). Kept in its own table rather than as columns on `tracks`
// because the indexer rewrites track rows with INSERT OR REPLACE on every
// re-index, which would otherwise reset the counts. Keyed by `tracks.id` (which
// is URI-derived and therefore stable across rescans) but, like
// `playlist_tracks`, not FK-enforced and not pruned: a row left dangling by a
// removed file simply never surfaces (reads LEFT JOIN), and re-links if the file
// returns. Drives getAlbumList2 type=frequent (play count) and type=recent (last
// played). Ratings are user-curated and small, so they live in the local-library
// store alongside favourites rather than here.
const SCHEMA_STATS = `
CREATE TABLE IF NOT EXISTS track_stats (
  track_id       TEXT PRIMARY KEY NOT NULL,
  play_count     INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_track_stats_last_played
  ON track_stats(last_played_at);
`;

// Self-hosted internet radio stations and podcasts. With a local backend there's
// no server to hold these (the way OpenSubsonic does), so they live on-device in
// SQLite and are managed through the same create/edit/delete flows. Stations and
// channels are user-curated; podcast episodes are parsed from the channel's RSS
// feed on-device (see services/podcastFeed.ts) and re-`upsert`ed on refresh. An
// episode's id encodes its enclosure URL (services/local/keys.ts), so the row is
// upserted by `id` — re-parsing a feed updates existing episodes in place rather
// than duplicating them. Episodes stream straight from the enclosure URL.
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS internet_radio_stations (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  stream_url    TEXT NOT NULL,
  home_page_url TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast_channels (
  id                 TEXT PRIMARY KEY NOT NULL,
  url                TEXT NOT NULL UNIQUE,
  title              TEXT,
  description        TEXT,
  author             TEXT,
  original_image_url TEXT,
  status             TEXT NOT NULL,
  error_message      TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id                 TEXT PRIMARY KEY NOT NULL,
  channel_id         TEXT NOT NULL,
  guid               TEXT,
  title              TEXT,
  description        TEXT,
  publish_date       INTEGER,
  duration           INTEGER,
  suffix             TEXT,
  content_type       TEXT,
  size               INTEGER,
  stream_url         TEXT NOT NULL,
  original_image_url TEXT,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_channel
  ON podcast_episodes(channel_id, publish_date DESC);
`;

// MusicBrainz tag corrections. Kept in their own table rather than as columns on
// `tracks` for the same reason as `track_stats`: the indexer rewrites track rows
// with INSERT OR REPLACE on every re-index, which would wipe them. Keyed by
// `tracks.id`, which is URI-derived and therefore stable across rescans, so a
// correction survives any number of rescans of the same file. Unlike
// `track_stats` these *are* pruned when their file vanishes (see indexer.ts):
// a correction is meaningless without the file it corrects.
//
// `album_key` / `artist_key` are stored rather than derived because album and
// artist ids are computed *from* those keys (services/local/keys.ts). Correcting
// an album's title without also carrying its recomputed key would leave the
// album grouped — and addressable — under its old, wrong name. They're written
// with the same albumKey()/normalizeKey() helpers the indexer uses.
//
// `written_to_file` records that the correction was also flushed into the file's
// own tags, so re-scanning picks it up from the file itself.
const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS track_tag_overrides (
  track_id            TEXT PRIMARY KEY NOT NULL,
  title               TEXT,
  artist              TEXT,
  album               TEXT,
  album_artist        TEXT,
  genre               TEXT,
  year                INTEGER,
  track_number        INTEGER,
  disc_number         INTEGER,
  artists_json        TEXT,
  music_brainz_id     TEXT,
  artwork_path        TEXT,
  album_key           TEXT,
  artist_key          TEXT,
  mb_recording_id     TEXT,
  mb_release_id       TEXT,
  mb_release_group_id TEXT,
  mb_artist_id        TEXT,
  source              TEXT NOT NULL,
  applied_at          INTEGER NOT NULL,
  written_to_file     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_track_tag_overrides_album_key
  ON track_tag_overrides(album_key);

CREATE TABLE IF NOT EXISTS album_tag_matches (
  album_key       TEXT PRIMARY KEY NOT NULL,
  mb_release_id   TEXT,
  confidence      REAL,
  status          TEXT NOT NULL,
  candidates_json TEXT,
  matched_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_album_tag_matches_status
  ON album_tag_matches(status);
`;

// Indexes over the stored grouping keys the `tracks_resolved` view reads. These
// are what album and artist lookups actually seek on; the equivalents on
// `tracks.album_key` / `tracks.artist_key` only serve the raw scanned values,
// which nothing queries by any more.
//
// Separate from SCHEMA_V5 because the columns they cover are added by
// `ensureColumn` — `tracks` predates them, so `CREATE TABLE IF NOT EXISTS`
// would never add them to an existing index.
const SCHEMA_V6 = `
CREATE INDEX IF NOT EXISTS idx_tracks_resolved_album_key
  ON tracks(resolved_album_key);
CREATE INDEX IF NOT EXISTS idx_tracks_resolved_artist_key
  ON tracks(resolved_artist_key);

-- The indexes these replace. Every read moved onto the view, whose grouping
-- keys come from the columns above and whose genre/title are COALESCE
-- expressions no index can serve, so nothing queries the scanned columns by
-- value any more — they were pure write overhead on every indexed track.
-- Dropped here rather than simply removed from SCHEMA_V1 because existing
-- on-device databases already have them.
DROP INDEX IF EXISTS idx_tracks_album_key;
DROP INDEX IF EXISTS idx_tracks_artist_key;
DROP INDEX IF EXISTS idx_tracks_genre;
DROP INDEX IF EXISTS idx_tracks_title;
`;

// Recomputes both stored grouping keys for one track from whatever the override
// table currently says. Correct in both directions — a correction applied and a
// correction cleared both just re-run it — which is why every writer shares this
// one statement instead of maintaining the columns itself.
export const REFRESH_RESOLVED_KEYS_SQL = `
UPDATE tracks SET
  resolved_album_key = COALESCE(
    (SELECT o.album_key FROM track_tag_overrides o WHERE o.track_id = tracks.id),
    album_key
  ),
  resolved_artist_key = COALESCE(
    (SELECT o.artist_key FROM track_tag_overrides o WHERE o.track_id = tracks.id),
    artist_key
  )
WHERE id = ?`;

// Every read goes through this view instead of `tracks`, so a correction is
// applied in exactly one place and shows up everywhere — browse, search, player,
// Android Auto, the widget — without any call site knowing overrides exist. A
// null override column falls back to the scanned tag, so a partial match only
// replaces the fields it actually resolved.
//
// Writes still target `tracks` directly (SQLite views are read-only) — the
// indexer is unaffected.
//
// The two grouping keys are the exception: they read a *stored* column on
// `tracks` rather than COALESCEing here. `WHERE album_key = ?` against a
// COALESCE is a predicate on an expression, which no index can serve, so every
// album and artist screen degraded into a full scan of `tracks`
// (`EXPLAIN QUERY PLAN` → `SCAN t`). Reading a plain column restores the index
// seek — and lets GROUP BY stream in index order instead of building a temp
// b-tree. Only the keys are denormalised: the displayed tags stay COALESCEd
// here, so a sync bug can misplace an album but can never show a wrong tag.
// See `refreshResolvedKeys` for the single statement that maintains them.
//
// Recreated on every open rather than migrated: a view holds no data, so
// DROP + CREATE is both idempotent and self-healing if its definition changes.
const SCHEMA_TRACKS_VIEW = `
DROP VIEW IF EXISTS tracks_resolved;
CREATE VIEW tracks_resolved AS
SELECT
  t.id, t.uri, t.path, t.folder, t.size, t.mtime,
  COALESCE(o.title, t.title)               AS title,
  COALESCE(o.artist, t.artist)             AS artist,
  COALESCE(o.album, t.album)               AS album,
  COALESCE(o.album_artist, t.album_artist) AS album_artist,
  t.composer,
  COALESCE(o.genre, t.genre)               AS genre,
  COALESCE(o.year, t.year)                 AS year,
  COALESCE(o.track_number, t.track_number) AS track_number,
  t.track_total,
  COALESCE(o.disc_number, t.disc_number)   AS disc_number,
  t.disc_total, t.duration_ms, t.bitrate, t.sample_rate,
  t.is_compilation, t.suffix,
  COALESCE(o.artwork_path, t.artwork_path)  AS artwork_path,
  t.artwork_mime, t.lyrics,
  COALESCE(o.music_brainz_id, t.music_brainz_id) AS music_brainz_id,
  COALESCE(o.artists_json, t.artists_json) AS artists_json,
  t.replay_gain_json, t.release_types_json,
  t.resolved_album_key                     AS album_key,
  t.resolved_artist_key                    AS artist_key,
  t.indexed_at
FROM tracks t
LEFT JOIN track_tag_overrides o ON o.track_id = t.id;
`;

/** Add `column` to `table` if it isn't already there. SQLite has no
 *  `ADD COLUMN IF NOT EXISTS`, so probe `table_info` first. */
async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  if (cols.some((c) => c.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  // The schema is entirely additive (`CREATE ... IF NOT EXISTS`), so apply it on
  // every open. It's cheap (each statement short-circuits when the object
  // exists) and self-healing: a DB whose `user_version` was advanced without its
  // tables actually being created — an interrupted/partial migration — would be
  // skipped forever by a version-gated approach, but is repaired here.
  await db.execAsync(SCHEMA_V1);
  await db.execAsync(SCHEMA_V2);
  await db.execAsync(SCHEMA_STATS);
  await db.execAsync(SCHEMA_V4);
  await db.execAsync(SCHEMA_V5);

  // SCHEMA_V1's `CREATE TABLE IF NOT EXISTS` won't add a column to a `tracks`
  // table that already exists from an earlier schema, so add later columns with
  // an idempotent ALTER. Cheap and self-healing on every open.
  await ensureColumn(db, "tracks", "release_types_json", "TEXT");
  // `podcast_channels.author` was added after the table shipped (still v4), so
  // existing on-device indexes need the column backfilled the same way.
  await ensureColumn(db, "podcast_channels", "author", "TEXT");
  // Added after album_tag_matches shipped (still v5).
  await ensureColumn(db, "album_tag_matches", "reason", "TEXT");
  // v6: the grouping keys the view reads. Added before the view is created,
  // since CREATE VIEW resolves its column references immediately and would
  // fail on a database that doesn't have them yet.
  await ensureColumn(db, "tracks", "resolved_album_key", "TEXT");
  await ensureColumn(db, "tracks", "resolved_artist_key", "TEXT");

  await db.execAsync(SCHEMA_V6);
  // Last: the view reads from `track_tag_overrides` and from the columns above.
  await db.execAsync(SCHEMA_TRACKS_VIEW);

  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // `user_version` gates *non-idempotent* migrations (column drops/renames, data
  // backfills) that can't simply be re-run. PRAGMA can't be parameterized;
  // SCHEMA_VERSION is a literal.
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (version > 0 && version < 3) {
      // v3: local ids moved from percent-encoded to hex payloads (decode-safe
      // for expo-router params — see services/local/keys.ts). Re-key existing
      // track rows in place from their stored `uri`, carrying the new id into
      // the FTS shadow table and any playlist memberships, so the index and
      // playlists survive the change without a rescan. (Album/artist ids are
      // derived at read time, so nothing stored needs migrating for them.)
      const rows = await txn.getAllAsync<{ id: string; uri: string }>(
        "SELECT id, uri FROM tracks",
      );
      for (const r of rows) {
        const next = localTrackId(r.uri);
        if (next === r.id) continue;
        await txn.runAsync("UPDATE tracks SET id = ? WHERE id = ?", next, r.id);
        await txn.runAsync(
          "UPDATE tracks_fts SET id = ? WHERE id = ?",
          next,
          r.id,
        );
        await txn.runAsync(
          "UPDATE playlist_tracks SET track_id = ? WHERE track_id = ?",
          next,
          r.id,
        );
      }
    }
    if (version < 6) {
      // v6: populate the stored grouping keys for every existing track. One
      // set-based statement rather than a row loop — this runs over the whole
      // library, and on a big index the difference is seconds. Tracks written
      // after this carry the columns from the start (see indexer.writeTrack).
      await txn.execAsync(`
        UPDATE tracks SET
          resolved_album_key = COALESCE(
            (SELECT o.album_key FROM track_tag_overrides o
              WHERE o.track_id = tracks.id),
            album_key
          ),
          resolved_artist_key = COALESCE(
            (SELECT o.artist_key FROM track_tag_overrides o
              WHERE o.track_id = tracks.id),
            artist_key
          )`);
    }
    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

// Shape of a `playlists` row as stored. Read queries adapt this to `Playlist`.
export type PlaylistRow = {
  id: string;
  name: string;
  comment: string | null;
  created_at: number;
  changed_at: number;
};

// Shape of a `tracks` row as stored. Read queries adapt this to `Child`.
export type TrackRow = {
  id: string;
  uri: string;
  path: string | null;
  folder: string | null;
  size: number | null;
  mtime: number | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  composer: string | null;
  genre: string | null;
  year: number | null;
  track_number: number | null;
  track_total: number | null;
  disc_number: number | null;
  disc_total: number | null;
  duration_ms: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  is_compilation: number;
  suffix: string | null;
  artwork_path: string | null;
  artwork_mime: string | null;
  lyrics: string | null;
  music_brainz_id: string | null;
  artists_json: string | null;
  replay_gain_json: string | null;
  album_key: string | null;
  artist_key: string | null;
  indexed_at: number;
  // Joined from `track_stats` (LEFT JOIN): play_count defaults to 0 and
  // last_played_at is null when the track has never been played.
  play_count: number;
  last_played_at: number | null;
};

// The tag fields a MusicBrainz match can correct. Null means "no correction for
// this field", which read queries COALESCE back to the scanned value — so a
// partial match only overrides what it actually knows.
export type TrackTagOverrideRow = {
  track_id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  year: number | null;
  track_number: number | null;
  disc_number: number | null;
  artists_json: string | null;
  music_brainz_id: string | null;
  // A cover downloaded from the Cover Art Archive, replacing the artwork the
  // indexer extracted from the file (or supplying one where there was none).
  artwork_path: string | null;
  album_key: string | null;
  artist_key: string | null;
  mb_recording_id: string | null;
  mb_release_id: string | null;
  mb_release_group_id: string | null;
  mb_artist_id: string | null;
  source: string;
  applied_at: number;
  written_to_file: number;
};

export type AlbumTagMatchStatus =
  | "pending"
  | "applied"
  | "dismissed"
  // Nothing usable was found. Kept as a row (rather than simply omitted) so the
  // UI can explain *why* — an album that silently vanishes from every list is
  // indistinguishable from one that was never scanned.
  | "unmatched";

// Review-queue state for one local album. `candidates_json` holds the ranked
// candidates from the last scan so reopening the review screen doesn't re-spend
// the MusicBrainz rate budget.
export type AlbumTagMatchRow = {
  album_key: string;
  mb_release_id: string | null;
  confidence: number | null;
  status: AlbumTagMatchStatus;
  candidates_json: string | null;
  matched_at: number;
  /** Why an `unmatched` row failed — a MatchFailure code, shown in the UI. */
  reason: string | null;
};

// Shape of an `internet_radio_stations` row. Read queries adapt this to
// `InternetRadioStation`.
export type RadioStationRow = {
  id: string;
  name: string;
  stream_url: string;
  home_page_url: string | null;
  created_at: number;
};

// Shape of a `podcast_channels` row. Read queries adapt this to `PodcastChannel`.
export type PodcastChannelRow = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  author: string | null;
  original_image_url: string | null;
  status: string;
  error_message: string | null;
  created_at: number;
  updated_at: number;
};

// Shape of a `podcast_episodes` row. Read queries adapt this to `PodcastEpisode`.
export type PodcastEpisodeRow = {
  id: string;
  channel_id: string;
  guid: string | null;
  title: string | null;
  description: string | null;
  publish_date: number | null;
  duration: number | null;
  suffix: string | null;
  content_type: string | null;
  size: number | null;
  stream_url: string;
  original_image_url: string | null;
  created_at: number;
};
