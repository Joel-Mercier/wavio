import { Directory, File, Paths } from "expo-file-system";
import { type AudioMetadata, getAudioMetadata } from "@/modules/audio-metadata";
import { logError } from "@/utils/log";
import { getLocalLibraryDb } from "./db";
import { albumKey, localTrackId, normalizeKey } from "./keys";

// The scanner. Walks the user-selected source folders, calls the native
// `audio-metadata` module per file and writes a normalized row into the
// per-(server, user) SQLite index (see db.ts). Incremental: a file whose path,
// size and mtime are unchanged since the last scan is skipped, so re-scans are
// cheap. Files that have disappeared from the selected folders are pruned.

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "wma",
  "aiff",
  "aif",
  "alac",
]);

// Guard against pathological directory trees / symlink loops.
const MAX_DEPTH = 12;
// Rows are written in batches inside one transaction for throughput; extraction
// itself happens outside any transaction (it's slow, native I/O).
const WRITE_BATCH_SIZE = 50;

const isAudioFile = (name: string): boolean =>
  AUDIO_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() ?? "");

const fileSuffix = (name: string): string | undefined =>
  name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;

export type ScanPhase = "listing" | "indexing" | "pruning" | "done";

export type ScanProgress = {
  phase: ScanPhase;
  /** Files extracted so far in the indexing phase. */
  processed: number;
  /** Files needing extraction this run (0 until the listing phase finishes). */
  total: number;
  /** Display name of the file currently being processed. */
  currentFile?: string;
};

export type ScanResult = {
  /** Files newly inserted or updated. */
  indexed: number;
  /** Up-to-date files skipped (unchanged since last scan). */
  skipped: number;
  /** Rows removed because the file vanished from the selected folders. */
  removed: number;
  /** Files the native module failed on (left as-was, if previously indexed). */
  failed: number;
  /** True when the scan stopped early via the controller. */
  cancelled: boolean;
};

/** Cooperative cancellation token. Pass into `scanLibrary` and call `cancel()`. */
export type ScanController = { readonly cancelled: boolean; cancel(): void };

export function createScanController(): ScanController {
  let cancelled = false;
  return {
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
  };
}

type ScannedFile = { uri: string; name: string; size: number; mtime: number };

type ExistingRow = { id: string; mtime: number | null; size: number | null };

/** Directory embedded artwork is written to (content-hashed by the native side). */
export const artworkDir = (): Directory =>
  new Directory(Paths.document, "local-artwork");

/**
 * Scan the given source folders and reconcile the on-device index with what's
 * on disk. Safe to call repeatedly; only changed files are re-extracted.
 *
 * @param folders Absolute paths or `file://` URIs to source directories.
 */
export async function scanLibrary(
  folders: string[],
  opts: {
    onProgress?: (progress: ScanProgress) => void;
    controller?: ScanController;
    /** Recover ReplayGain / lyrics / multi-artist / MBID via raw-tag reads. */
    enrich?: boolean;
  } = {},
): Promise<ScanResult> {
  const { onProgress, controller, enrich = true } = opts;
  const result: ScanResult = {
    indexed: 0,
    skipped: 0,
    removed: 0,
    failed: 0,
    cancelled: false,
  };

  onProgress?.({ phase: "listing", processed: 0, total: 0 });

  // 1. Gather every audio file under the selected folders (de-duplicated by URI
  //    in case folders overlap or nest).
  const seen = new Map<string, ScannedFile>();
  for (const folder of folders) {
    if (controller?.cancelled) {
      result.cancelled = true;
      return result;
    }
    try {
      // SAF folders picked on Android are content:// tree URIs; bare absolute
      // paths get the file:// scheme. Anything already carrying a scheme
      // (content://, file://) is passed through untouched.
      const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(folder)
        ? folder
        : `file://${folder}`;
      const dir = new Directory(normalized);
      if (dir.exists) collectAudioFiles(dir, seen, 0);
    } catch (error) {
      logError(`[localLibrary] Failed to list folder ${folder}`, error);
    }
  }

  const db = await getLocalLibraryDb();

  // 2. Diff against the current index to find work (new/changed files only).
  const existing = await loadExistingRows(db);
  const work: ScannedFile[] = [];
  for (const file of seen.values()) {
    const prior = existing.get(file.uri);
    if (prior && prior.mtime === file.mtime && prior.size === file.size) {
      result.skipped++;
    } else {
      work.push(file);
    }
  }

  onProgress?.({ phase: "indexing", processed: 0, total: work.length });

  // 3. Extract + write changed files, batching writes into transactions.
  const dest = artworkDir();
  try {
    if (!dest.exists) dest.create({ intermediates: true });
  } catch (error) {
    logError("[localLibrary] Failed to create artwork dir", error);
  }

  let batch: TrackInsert[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const pending = batch;
    batch = [];
    await db.withTransactionAsync(async () => {
      for (const row of pending) await writeTrack(db, row);
    });
  };

  for (const file of work) {
    if (controller?.cancelled) {
      result.cancelled = true;
      break;
    }
    onProgress?.({
      phase: "indexing",
      processed: result.indexed + result.failed,
      total: work.length,
      currentFile: file.name,
    });
    try {
      const metadata = await getAudioMetadata(file.uri, {
        artworkDir: dest.uri,
        enrich,
      });
      batch.push(toTrackInsert(file, metadata));
      result.indexed++;
      if (batch.length >= WRITE_BATCH_SIZE) await flush();
    } catch (error) {
      result.failed++;
      logError(`[localLibrary] Failed to index ${file.uri}`, error);
    }
  }
  await flush();

  // 4. Prune rows whose files are gone — but only after a *complete* scan, since
  //    a cancelled run hasn't observed the full folder set.
  if (!result.cancelled) {
    onProgress?.({
      phase: "pruning",
      processed: result.indexed,
      total: work.length,
    });
    const removable: string[] = [];
    for (const [uri, row] of existing) {
      if (!seen.has(uri)) removable.push(row.id);
    }
    if (removable.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const id of removable) {
          await db.runAsync("DELETE FROM tracks WHERE id = ?", id);
          await db.runAsync("DELETE FROM tracks_fts WHERE id = ?", id);
        }
      });
      result.removed = removable.length;
    }
  }

  onProgress?.({
    phase: "done",
    processed: result.indexed,
    total: work.length,
  });
  return result;
}

// --- internals -------------------------------------------------------------

function collectAudioFiles(
  dir: Directory,
  out: Map<string, ScannedFile>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  let entries: (File | Directory)[];
  try {
    entries = dir.list();
  } catch (error) {
    logError(`[localLibrary] Failed to list ${dir.uri}`, error);
    return;
  }
  for (const entry of entries) {
    if (entry instanceof File) {
      if (!isAudioFile(entry.name)) continue;
      out.set(entry.uri, {
        uri: entry.uri,
        name: entry.name,
        size: entry.size ?? 0,
        mtime: entry.modificationTime ?? 0,
      });
    } else {
      collectAudioFiles(entry, out, depth + 1);
    }
  }
}

async function loadExistingRows(
  db: Awaited<ReturnType<typeof getLocalLibraryDb>>,
): Promise<Map<string, ExistingRow>> {
  const rows = await db.getAllAsync<{
    id: string;
    uri: string;
    mtime: number | null;
    size: number | null;
  }>("SELECT id, uri, mtime, size FROM tracks");
  const map = new Map<string, ExistingRow>();
  for (const row of rows) {
    map.set(row.uri, { id: row.id, mtime: row.mtime, size: row.size });
  }
  return map;
}

// A flat record matching the `tracks` columns, ready to bind.
type TrackInsert = {
  id: string;
  uri: string;
  path: string;
  folder: string | null;
  size: number;
  mtime: number;
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
  album_key: string;
  artist_key: string;
  indexed_at: number;
};

function toTrackInsert(file: ScannedFile, m: AudioMetadata): TrackInsert {
  // Strip the file:// scheme for a friendlier `path` (used for display/folder).
  const path = file.uri.replace(/^file:\/\//, "");
  const slash = path.lastIndexOf("/");
  const folder = slash > 0 ? path.slice(0, slash) : null;
  const title = m.title ?? file.name.replace(/\.[^.]+$/, "");
  const artist = m.artist ?? null;
  const albumArtist = m.albumArtist ?? null;
  return {
    id: localTrackId(file.uri),
    uri: file.uri,
    path,
    folder,
    size: file.size,
    mtime: file.mtime,
    title,
    artist,
    album: m.album ?? null,
    album_artist: albumArtist,
    composer: m.composer ?? null,
    genre: m.genre ?? null,
    year: m.year ?? null,
    track_number: m.trackNumber ?? null,
    track_total: m.trackTotal ?? null,
    disc_number: m.discNumber ?? null,
    disc_total: m.discTotal ?? null,
    duration_ms: m.durationMs ?? null,
    bitrate: m.bitrate ?? null,
    sample_rate: m.sampleRate ?? null,
    is_compilation: m.isCompilation ? 1 : 0,
    suffix: fileSuffix(file.name) ?? null,
    artwork_path: m.artworkPath ?? null,
    artwork_mime: m.artworkMimeType ?? null,
    lyrics: m.lyrics ?? null,
    music_brainz_id: m.musicBrainzId ?? null,
    artists_json: m.artists?.length ? JSON.stringify(m.artists) : null,
    replay_gain_json: m.replayGain ? JSON.stringify(m.replayGain) : null,
    album_key: albumKey(m.album, albumArtist, artist),
    artist_key: normalizeKey(albumArtist || artist),
    indexed_at: Date.now(),
  };
}

const INSERT_SQL = `
INSERT OR REPLACE INTO tracks (
  id, uri, path, folder, size, mtime, title, artist, album, album_artist,
  composer, genre, year, track_number, track_total, disc_number, disc_total,
  duration_ms, bitrate, sample_rate, is_compilation, suffix, artwork_path,
  artwork_mime, lyrics, music_brainz_id, artists_json, replay_gain_json,
  album_key, artist_key, indexed_at
) VALUES (
  $id, $uri, $path, $folder, $size, $mtime, $title, $artist, $album,
  $album_artist, $composer, $genre, $year, $track_number, $track_total,
  $disc_number, $disc_total, $duration_ms, $bitrate, $sample_rate,
  $is_compilation, $suffix, $artwork_path, $artwork_mime, $lyrics,
  $music_brainz_id, $artists_json, $replay_gain_json, $album_key, $artist_key,
  $indexed_at
)`;

async function writeTrack(
  db: Awaited<ReturnType<typeof getLocalLibraryDb>>,
  row: TrackInsert,
): Promise<void> {
  // Keep the standalone FTS row in sync. `INSERT OR REPLACE` above may delete a
  // prior row (PK or UNIQUE(uri) conflict); clear by id first, then re-add.
  await db.runAsync("DELETE FROM tracks_fts WHERE id = ?", row.id);
  await db.runAsync(INSERT_SQL, {
    $id: row.id,
    $uri: row.uri,
    $path: row.path,
    $folder: row.folder,
    $size: row.size,
    $mtime: row.mtime,
    $title: row.title,
    $artist: row.artist,
    $album: row.album,
    $album_artist: row.album_artist,
    $composer: row.composer,
    $genre: row.genre,
    $year: row.year,
    $track_number: row.track_number,
    $track_total: row.track_total,
    $disc_number: row.disc_number,
    $disc_total: row.disc_total,
    $duration_ms: row.duration_ms,
    $bitrate: row.bitrate,
    $sample_rate: row.sample_rate,
    $is_compilation: row.is_compilation,
    $suffix: row.suffix,
    $artwork_path: row.artwork_path,
    $artwork_mime: row.artwork_mime,
    $lyrics: row.lyrics,
    $music_brainz_id: row.music_brainz_id,
    $artists_json: row.artists_json,
    $replay_gain_json: row.replay_gain_json,
    $album_key: row.album_key,
    $artist_key: row.artist_key,
    $indexed_at: row.indexed_at,
  });
  await db.runAsync(
    `INSERT INTO tracks_fts (id, title, artist, album, album_artist)
     VALUES ($id, $title, $artist, $album, $album_artist)`,
    {
      $id: row.id,
      $title: row.title,
      $artist: row.artist,
      $album: row.album,
      $album_artist: row.album_artist,
    },
  );
}
