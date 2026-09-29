import type { SQLiteDatabase } from "expo-sqlite";
import { searchVariants } from "@/services/searchText";

// `tracks_fts.id` is UNINDEXED, so `DELETE … WHERE id = ?` scans the whole FTS
// table — once per written track, which made a scan O(N²). Each track instead
// records its FTS row's rowid in `tracks.fts_rowid`, and every delete seeks on
// it. The column is NULL on rows written before it existed (or by an older app
// version after a downgrade); those take the by-id path once and heal on write.

export type FtsFields = {
  id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
};

/**
 * Delete a track's FTS row. The rowid delete also checks the id: an older app
 * version rewrites FTS rows without updating `fts_rowid`, so a stale rowid can
 * point at another track's row, which a bare rowid delete would remove.
 */
export async function deleteFtsRow(
  db: SQLiteDatabase,
  id: string,
  ftsRowid: number | null,
): Promise<void> {
  if (ftsRowid != null) {
    const { changes } = await db.runAsync(
      "DELETE FROM tracks_fts WHERE rowid = ? AND id = ?",
      ftsRowid,
      id,
    );
    if (changes > 0) return;
  }
  await db.runAsync("DELETE FROM tracks_fts WHERE id = ?", id);
}

/** Insert a track's FTS row and return its rowid, for `tracks.fts_rowid`. */
export async function insertFtsRow(
  db: SQLiteDatabase,
  row: FtsFields,
): Promise<number> {
  const { lastInsertRowId } = await db.runAsync(
    `INSERT INTO tracks_fts (id, title, artist, album, album_artist, normalized)
     VALUES (?, ?, ?, ?, ?, ?)`,
    row.id,
    row.title,
    row.artist,
    row.album,
    row.album_artist,
    searchVariants([row.title, row.artist, row.album, row.album_artist]),
  );
  return lastInsertRowId;
}

/**
 * Replace a track's FTS row and return the new rowid. The caller must store it
 * in `tracks.fts_rowid`. A track with no `tracks` row yet has no FTS row to
 * delete, which keeps a first scan off the by-id path entirely.
 */
export async function replaceFtsRow(
  db: SQLiteDatabase,
  row: FtsFields,
): Promise<number> {
  const existing = await db.getFirstAsync<{ fts_rowid: number | null }>(
    "SELECT fts_rowid FROM tracks WHERE id = ?",
    row.id,
  );
  if (existing) await deleteFtsRow(db, row.id, existing.fts_rowid);
  return insertFtsRow(db, row);
}
