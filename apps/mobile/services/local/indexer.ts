import { Directory, File, Paths } from "expo-file-system";
import { type AudioMetadata, getAudioMetadata } from "@/modules/audio-metadata";
import { reportBreadcrumb, reportError } from "@/services/errorReporting";
import { logError } from "@/utils/log";
import { getLocalLibraryDb } from "./db";
import { deriveTrackTags } from "./deriveTags";
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
// Files extracted in parallel. Each extraction is native I/O plus a JS-side
// raw-tag read, so a small pool overlaps the two without flooding either.
const EXTRACT_CONCURRENCY = 4;
// `dir.list()` is synchronous; yield to the event loop every N directories so
// a large walk doesn't starve the UI thread.
const LIST_YIELD_EVERY = 25;

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

type ScannedFile = {
  uri: string;
  name: string;
  size: number;
  mtime: number;
  // The configured root (as it appears in Server.paths) this file was found
  // under. First folder to reach a URI wins, matching the URI de-dup below.
  sourceFolder: string;
};

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
    /**
     * Re-extract every file even when its path/size/mtime are unchanged. The
     * default incremental scan skips unchanged files, so a re-scan after an
     * extractor change (new tag fields) would be a no-op without this.
     */
    force?: boolean;
  } = {},
): Promise<ScanResult> {
  const { onProgress, controller, enrich = true, force = false } = opts;
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
  const listed = { dirs: 0 };
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
      if (dir.exists) await collectAudioFiles(dir, seen, 0, listed, folder);
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
    if (
      !force &&
      prior &&
      prior.mtime === file.mtime &&
      prior.size === file.size
    ) {
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
  // Workers extract in parallel, so transactions are chained to keep them from
  // overlapping on the shared connection.
  let writeChain: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => {
    if (batch.length === 0) return writeChain;
    const pending = batch;
    batch = [];
    writeChain = writeChain.then(() =>
      db.withTransactionAsync(async () => {
        for (const row of pending) await writeTrack(db, row);
      }),
    );
    return writeChain;
  };

  let nextWorkIndex = 0;
  // A handful of failing URIs to attach to the aggregated Sentry report below —
  // enough to spot a pattern (one bad codec, one unreadable folder) without
  // shipping the user's whole library path list.
  const failedSamples: string[] = [];
  const worker = async () => {
    while (nextWorkIndex < work.length) {
      if (controller?.cancelled) {
        result.cancelled = true;
        return;
      }
      const file = work[nextWorkIndex++];
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
        if (failedSamples.length < 10) failedSamples.push(file.uri);
        // Per-file breadcrumb (not an Issue): a single bad file shouldn't page
        // anyone, but the trail gives the aggregated report below its context.
        reportBreadcrumb("local-library", "extract failed", {
          uri: file.uri,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(EXTRACT_CONCURRENCY, work.length) }, () =>
      worker(),
    ),
  );
  await flush();

  // One aggregated Issue per scan when files failed to index — captures the
  // metadata-extraction failure rate without spamming an event per file.
  if (result.failed > 0) {
    reportError(
      new Error(
        `Local library scan: ${result.failed}/${work.length} files failed to index`,
      ),
      {
        area: "local-library",
        endpoint: "scanLibrary",
        extra: {
          failed: result.failed,
          indexed: result.indexed,
          total: work.length,
          sampleUris: failedSamples,
        },
      },
    );
  }

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

/**
 * Delete every indexed track whose `source_folder` is one of `folders` (and its
 * FTS shadow row). Used when a folder is dropped from the library config so its
 * tracks are removed directly, without re-walking the folders that remain.
 * No-op for an empty list.
 */
export async function deleteTracksByFolders(
  db: Awaited<ReturnType<typeof getLocalLibraryDb>>,
  folders: string[],
): Promise<number> {
  if (folders.length === 0) return 0;
  const placeholders = folders.map(() => "?").join(", ");
  let removed = 0;
  await db.withTransactionAsync(async () => {
    const ids = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM tracks WHERE source_folder IN (${placeholders})`,
      ...folders,
    );
    for (const { id } of ids) {
      await db.runAsync("DELETE FROM tracks WHERE id = ?", id);
      await db.runAsync("DELETE FROM tracks_fts WHERE id = ?", id);
    }
    removed = ids.length;
  });
  return removed;
}

// --- internals -------------------------------------------------------------

async function collectAudioFiles(
  dir: Directory,
  out: Map<string, ScannedFile>,
  depth: number,
  listed: { dirs: number },
  sourceFolder: string,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (++listed.dirs % LIST_YIELD_EVERY === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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
      if (out.has(entry.uri)) continue;
      out.set(entry.uri, {
        uri: entry.uri,
        name: entry.name,
        size: entry.size ?? 0,
        mtime: entry.modificationTime ?? 0,
        sourceFolder,
      });
    } else {
      await collectAudioFiles(entry, out, depth + 1, listed, sourceFolder);
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
  release_types_json: string | null;
  album_key: string;
  artist_key: string;
  source_folder: string;
  indexed_at: number;
};

function toTrackInsert(file: ScannedFile, m: AudioMetadata): TrackInsert {
  // Strip the file:// scheme for a friendlier `path` (used for display/folder).
  const path = file.uri.replace(/^file:\/\//, "");
  const slash = path.lastIndexOf("/");
  const folder = slash > 0 ? path.slice(0, slash) : null;
  // Recover title/artist/album/track from the filename + folder layout when the
  // file's embedded tags don't supply them, so untagged files still group into
  // navigable albums/artists instead of one hidden "Unknown" bucket.
  const derived = deriveTrackTags(path, file.name, m);
  const title = derived.title;
  const artist = derived.artist ?? null;
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
    album: derived.album ?? null,
    album_artist: albumArtist,
    composer: m.composer ?? null,
    genre: m.genre ?? null,
    year: m.year ?? null,
    track_number: derived.trackNumber ?? null,
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
    release_types_json: m.releaseTypes?.length
      ? JSON.stringify(m.releaseTypes)
      : null,
    album_key: albumKey(derived.album, albumArtist, artist),
    artist_key: normalizeKey(albumArtist || artist),
    source_folder: file.sourceFolder,
    indexed_at: Date.now(),
  };
}

const INSERT_SQL = `
INSERT OR REPLACE INTO tracks (
  id, uri, path, folder, size, mtime, title, artist, album, album_artist,
  composer, genre, year, track_number, track_total, disc_number, disc_total,
  duration_ms, bitrate, sample_rate, is_compilation, suffix, artwork_path,
  artwork_mime, lyrics, music_brainz_id, artists_json, replay_gain_json,
  release_types_json, album_key, artist_key, source_folder, indexed_at
) VALUES (
  $id, $uri, $path, $folder, $size, $mtime, $title, $artist, $album,
  $album_artist, $composer, $genre, $year, $track_number, $track_total,
  $disc_number, $disc_total, $duration_ms, $bitrate, $sample_rate,
  $is_compilation, $suffix, $artwork_path, $artwork_mime, $lyrics,
  $music_brainz_id, $artists_json, $replay_gain_json, $release_types_json,
  $album_key, $artist_key, $source_folder, $indexed_at
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
    $release_types_json: row.release_types_json,
    $album_key: row.album_key,
    $artist_key: row.artist_key,
    $source_folder: row.source_folder,
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
