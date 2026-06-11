import {
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import { getAuthScope } from "@/config/storage";
import { localTrackId } from "@/services/local/keys";
import { useAuthBase } from "@/stores/auth";
import { logError } from "@/utils/log";

// Per-(server, user) on-device index for the local-library feature. SQLite (not
// MMKV) so the catalog can be queried, grouped and full-text searched at scale —
// a few thousand local tracks would be unwieldy as a single JSON blob.
//
// The index is scoped exactly like the rest of the app's persisted state: a
// separate physical database file per `getAuthScope(url, username)`, so
// switching servers never mixes one account's local library into another's. The
// handle follows the active scope automatically (see `getLocalLibraryDb`).

const SCHEMA_VERSION = 3;

const currentScope = (): string => {
  const { url, username } = useAuthBase.getState();
  return getAuthScope(url, username);
};

// `getAuthScope` already sanitizes to [A-Za-z0-9_], so the scope is a safe
// filename fragment.
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
CREATE INDEX IF NOT EXISTS idx_tracks_album_key ON tracks(album_key);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_key ON tracks(artist_key);
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);

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

  // SCHEMA_V1's `CREATE TABLE IF NOT EXISTS` won't add a column to a `tracks`
  // table that already exists from an earlier schema, so add later columns with
  // an idempotent ALTER. Cheap and self-healing on every open.
  await ensureColumn(db, "tracks", "release_types_json", "TEXT");

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
