import {
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import { getAuthScope } from "@/config/storage";
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

const SCHEMA_VERSION = 1;

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

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (version < 1) {
      await txn.execAsync(SCHEMA_V1);
    }
    // Future migrations: `if (version < 2) { ... }` etc.
    // PRAGMA user_version can't be parameterized; SCHEMA_VERSION is a literal.
    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

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
};
