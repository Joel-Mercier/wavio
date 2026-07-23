import {
  type AlbumTagMatchRow,
  type AlbumTagMatchStatus,
  getLocalLibraryDb,
  REFRESH_RESOLVED_KEYS_SQL,
  type TrackTagOverrideRow,
} from "./db";

// Data access for MusicBrainz tag corrections. Reads of *corrected* tracks go
// through the `tracks_resolved` view (see repository.ts); this file is only the
// write side plus the review-queue bookkeeping.

export type TrackOverrideInput = Omit<
  TrackTagOverrideRow,
  "applied_at" | "source" | "written_to_file"
> & {
  source?: string;
  writtenToFile?: boolean;
};

const UPSERT_OVERRIDE = `
INSERT OR REPLACE INTO track_tag_overrides (
  track_id, title, artist, album, album_artist, genre, year,
  track_number, disc_number, artists_json, music_brainz_id, artwork_path,
  album_key, artist_key, mb_recording_id, mb_release_id,
  mb_release_group_id, mb_artist_id, source, applied_at, written_to_file
) VALUES (
  $track_id, $title, $artist, $album, $album_artist, $genre, $year,
  $track_number, $disc_number, $artists_json, $music_brainz_id, $artwork_path,
  $album_key, $artist_key, $mb_recording_id, $mb_release_id,
  $mb_release_group_id, $mb_artist_id, $source, $applied_at, $written_to_file
)`;

/**
 * Writes a correction, then brings the two things that shadow it back in step:
 * the track's full-text row and its stored grouping keys.
 *
 * `tracks_fts` is a standalone FTS5 table the indexer maintains by hand, so it
 * still holds the *scanned* title/artist/album. Without this refresh a corrected
 * album would be visible everywhere but unfindable by its corrected name.
 *
 * `tracks.resolved_*` is what the view groups and seeks on (see db.ts), so
 * without the second refresh a corrected album would keep sorting under its old
 * key while displaying its new name.
 */
export async function upsertTrackOverride(
  input: TrackOverrideInput,
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(UPSERT_OVERRIDE, {
      $track_id: input.track_id,
      $title: input.title,
      $artist: input.artist,
      $album: input.album,
      $album_artist: input.album_artist,
      $genre: input.genre,
      $year: input.year,
      $track_number: input.track_number,
      $disc_number: input.disc_number,
      $artists_json: input.artists_json,
      $music_brainz_id: input.music_brainz_id,
      $artwork_path: input.artwork_path,
      $album_key: input.album_key,
      $artist_key: input.artist_key,
      $mb_recording_id: input.mb_recording_id,
      $mb_release_id: input.mb_release_id,
      $mb_release_group_id: input.mb_release_group_id,
      $mb_artist_id: input.mb_artist_id,
      $source: input.source ?? "musicbrainz",
      $applied_at: Date.now(),
      $written_to_file: input.writtenToFile ? 1 : 0,
    });
    await refreshTrackShadows(db, input.track_id);
  });
}

/**
 * Re-derives everything that mirrors a track's corrected tags: its full-text row
 * and its stored grouping keys. Both are recomputed from current state, so this
 * is equally correct after writing a correction and after clearing one.
 */
async function refreshTrackShadows(
  db: Awaited<ReturnType<typeof getLocalLibraryDb>>,
  trackId: string,
): Promise<void> {
  await db.runAsync(REFRESH_RESOLVED_KEYS_SQL, trackId);
  await refreshFtsRow(db, trackId);
}

async function refreshFtsRow(
  db: Awaited<ReturnType<typeof getLocalLibraryDb>>,
  trackId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    album_artist: string | null;
  }>(
    `SELECT id, title, artist, album, album_artist
     FROM tracks_resolved WHERE id = ?`,
    trackId,
  );
  if (!row) return;
  await db.runAsync("DELETE FROM tracks_fts WHERE id = ?", trackId);
  await db.runAsync(
    `INSERT INTO tracks_fts (id, title, artist, album, album_artist)
     VALUES (?, ?, ?, ?, ?)`,
    row.id,
    row.title,
    row.artist,
    row.album,
    row.album_artist,
  );
}

export async function getTrackOverride(
  trackId: string,
): Promise<TrackTagOverrideRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<TrackTagOverrideRow>(
    "SELECT * FROM track_tag_overrides WHERE track_id = ?",
    trackId,
  );
}

/** Corrections whose *corrected* album key matches — i.e. where the album sits now. */
export async function getOverridesForAlbum(
  albumKey: string,
): Promise<TrackTagOverrideRow[]> {
  const db = await getLocalLibraryDb();
  return db.getAllAsync<TrackTagOverrideRow>(
    "SELECT * FROM track_tag_overrides WHERE album_key = ?",
    albumKey,
  );
}

export async function countTrackOverrides(): Promise<number> {
  const db = await getLocalLibraryDb();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM track_tag_overrides",
  );
  return row?.count ?? 0;
}

/**
 * Reverts corrections and puts the affected tracks' full-text rows and grouping
 * keys back to their scanned values.
 */
export async function clearTrackOverrides(trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) return;
  const db = await getLocalLibraryDb();
  await db.withTransactionAsync(async () => {
    for (const id of trackIds) {
      await db.runAsync(
        "DELETE FROM track_tag_overrides WHERE track_id = ?",
        id,
      );
      await refreshTrackShadows(db, id);
    }
  });
}

/**
 * Re-applies corrections after an indexing pass.
 *
 * The indexer rewrites a track's row wholesale from the tags it just read off
 * the file, which reverts both shadows of a correction: the `tracks_fts` row
 * and the stored grouping keys (see indexer.writeTrack). Re-deriving from the
 * override table costs one pass over the corrections — which are few — rather
 * than a lookup per indexed track, of which there may be tens of thousands.
 */
export async function reapplyOverridesAfterIndexing(): Promise<void> {
  const db = await getLocalLibraryDb();
  const rows = await db.getAllAsync<{ track_id: string }>(
    "SELECT track_id FROM track_tag_overrides",
  );
  if (rows.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const row of rows) await refreshTrackShadows(db, row.track_id);
  });
}

export async function clearAllTrackOverrides(): Promise<void> {
  const db = await getLocalLibraryDb();
  const rows = await db.getAllAsync<{ track_id: string }>(
    "SELECT track_id FROM track_tag_overrides",
  );
  await clearTrackOverrides(rows.map((r) => r.track_id));
}

// --- review queue -----------------------------------------------------------

export async function upsertAlbumMatch(
  row: Omit<AlbumTagMatchRow, "matched_at">,
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO album_tag_matches
       (album_key, mb_release_id, confidence, status, candidates_json, matched_at, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    row.album_key,
    row.mb_release_id,
    row.confidence,
    row.status,
    row.candidates_json,
    Date.now(),
    row.reason ?? null,
  );
}

export async function queryAlbumMatches(
  status?: AlbumTagMatchStatus,
): Promise<AlbumTagMatchRow[]> {
  const db = await getLocalLibraryDb();
  return status
    ? db.getAllAsync<AlbumTagMatchRow>(
        `SELECT * FROM album_tag_matches WHERE status = ?
         ORDER BY confidence DESC`,
        status,
      )
    : db.getAllAsync<AlbumTagMatchRow>(
        "SELECT * FROM album_tag_matches ORDER BY confidence DESC",
      );
}

export async function getAlbumMatch(
  albumKey: string,
): Promise<AlbumTagMatchRow | null> {
  const db = await getLocalLibraryDb();
  return db.getFirstAsync<AlbumTagMatchRow>(
    "SELECT * FROM album_tag_matches WHERE album_key = ?",
    albumKey,
  );
}

export async function setAlbumMatchStatus(
  albumKey: string,
  status: AlbumTagMatchStatus,
): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    "UPDATE album_tag_matches SET status = ? WHERE album_key = ?",
    status,
    albumKey,
  );
}

/** Drop one album's match row — used when a correction re-files it under a new key. */
export async function deleteAlbumMatch(albumKey: string): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync(
    "DELETE FROM album_tag_matches WHERE album_key = ?",
    albumKey,
  );
}

export async function clearAlbumMatches(): Promise<void> {
  const db = await getLocalLibraryDb();
  await db.runAsync("DELETE FROM album_tag_matches");
}
