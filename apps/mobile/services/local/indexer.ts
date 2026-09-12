import { Directory, File, Paths } from "expo-file-system";
import { type AudioMetadata, getAudioMetadata } from "@/modules/audio-metadata";
import { reportBreadcrumb, reportError } from "@/services/errorReporting";
import { activeFileSource } from "@/services/fileSource";
import type { FileSource, RemoteEntry } from "@/services/fileSource/types";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { logError } from "@/utils/log";
import {
  artNamesOrDefault,
  DEFAULT_ALBUM_ART_NAMES,
  DEFAULT_ARTIST_ART_NAMES,
} from "./artNames";
import { persistedArtworkNames } from "./artworkRefs";
import { getLocalLibraryDb, libraryScope } from "./db";
import { deriveTrackTags } from "./deriveTags";
import {
  folderImageKey,
  mirrorFolderImage,
  pickFolderImage,
} from "./folderArt";
import {
  type DirectoryIgnore,
  type IgnoreScope,
  isIgnored,
  readDirectoryIgnore,
} from "./ignoreRules";
import { albumKey, localTrackId, normalizeKey } from "./keys";
import { reapplyOverridesAfterIndexing } from "./tagOverrides";

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
// The device source lists synchronously — and is the one source the walk runs
// serially for exactly that reason — so yield to the event loop every N
// directories, or a large walk starves the UI thread.
const LIST_YIELD_EVERY = 25;
// A scan raises an Issue only when it fails on both enough files and a large
// enough share of them: individual unreadable files are a fact of any real
// library, a systematic reader failure is not.
const MIN_SCAN_FAILURES_TO_REPORT = 5;
const MIN_SCAN_FAILURE_RATE_TO_REPORT = 0.05;

const isAudioFile = (name: string): boolean =>
  AUDIO_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() ?? "");

const fileSuffix = (name: string): string | undefined =>
  name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;

export type ScanPhase = "listing" | "indexing" | "artwork" | "pruning" | "done";

export type ScanProgress = {
  phase: ScanPhase;
  /** Files extracted so far in the indexing phase. */
  processed: number;
  /** Files needing extraction this run (0 until the listing phase finishes). */
  total: number;
  /** Display name of the file currently being processed. */
  currentFile?: string;
  /**
   * Directories walked so far. The listing phase has no total to count against
   * (that's what it's computing), and on a network share it's the slow half of
   * the scan — so this is the only thing that tells the user it's moving.
   */
  directories?: number;
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
  /**
   * True when at least one directory couldn't be listed, so the walk never saw
   * the whole library. Suppresses the prune — see `scanLibrary`.
   */
  incomplete: boolean;
  /** How many directories failed to list, for the "partial scan" warning. */
  unreadable: number;
  /**
   * Directories hidden by a `.ignore` / `.ndignore` / `.nomedia` file. Surfaced
   * to the user by components/local/IncompleteScanNotice on the scan where it
   * first rises, and kept in the breadcrumb trail either way so "a folder went
   * missing" is answerable rather than a guess.
   */
  ignoredDirectories: number;
  /**
   * Directories that resolved to a sidecar cover (`cover.jpg` and friends, see
   * folderArt.ts). Reported so a scan that found none is distinguishable from
   * one that never looked.
   */
  sidecarCovers: number;
  /**
   * Folder and artist art rows written or deleted. Distinct from
   * `sidecarCovers`, which counts every directory that *has* a cover and so is
   * non-zero on almost every scan: this counts what actually changed, which is
   * what tells a caller whether anything on screen is now stale. A scan can
   * change nothing but artwork — a cover dropped into an otherwise untouched
   * folder, or an edit to the configured filenames — and then `indexed` and
   * `removed` are both 0.
   */
  artChanged: number;
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
  /**
   * Canonical URI of the directory this file was listed in, as the source
   * reported it. Taken from the walk rather than parsed off `uri`, because a SAF
   * `content://` document URI percent-encodes its separators — slicing at the
   * last `/` yields the same bogus prefix for every file in the tree, which is
   * exactly the join key sidecar artwork needs to be right.
   */
  dir: string;
  // The configured root (as it appears in Server.paths) this file was found
  // under. First folder to reach a URI wins, matching the URI de-dup below.
  sourceFolder: string;
};

type ExistingRow = {
  id: string;
  mtime: number | null;
  size: number | null;
  dir: string | null;
};

/** Running state of the directory walk, threaded through the recursion. */
type ListingState = {
  dirs: number;
  failed: number;
  ignored: number;
  onProgress?: (dirs: number) => void;
  /**
   * What the walk saw in each directory it could read, keyed by the directory's
   * canonical URI. Filled from the listing that the walk already had to fetch,
   * so recognising a `cover.jpg` costs no extra round trip — the entries are
   * simply no longer thrown away at the audio-file filter.
   */
  art: Map<string, DirectoryArt>;
};

/** One directory's contribution to sidecar-artwork resolution. */
type DirectoryArt = {
  /** Canonical URI of the parent directory, absent at a scan root. */
  parent?: string;
  /** At least one audio file was indexed directly in here. */
  hasAudio: boolean;
  /** Best `cover.jpg` / `front.png` / … in this directory. */
  album?: RemoteEntry;
  /** Best `artist.jpg` in this directory. */
  artist?: RemoteEntry;
};

/** One directory waiting to be listed — the old recursion's parameters, heaped. */
type PendingDir = {
  path: string;
  depth: number;
  /**
   * This directory's path relative to the scan root, `""` at the root. Ignore
   * patterns are written against it, not against the canonical URI.
   */
  relative: string;
  /**
   * Ignore rules declared by this directory's ancestors, innermost last. Shared
   * rather than copied, and never mutated — a directory that declares its own
   * rules queues its children with a new array instead.
   */
  scopes: IgnoreScope[];
  /** Canonical URI of the parent directory, absent at a scan root. */
  parent?: string;
};

/** Everything one root's walk shares between its in-flight directories. */
type WalkContext = {
  source: FileSource;
  out: Map<string, ScannedFile>;
  listed: ListingState;
  /** The configured root (as it appears in Server.paths) this walk is under. */
  sourceFolder: string;
  /**
   * Sidecar filenames to look for, resolved once per scan rather than read per
   * directory: the setting can change while a long walk is running, and half a
   * library indexed under each list is worse than either.
   */
  albumArtNames: readonly string[];
  artistArtNames: readonly string[];
  controller?: ScanController;
};

/**
 * Directory this library's artwork is written to — embedded pictures
 * (content-hashed by the native side) and mirrored sidecar covers alike.
 *
 * Scoped per (server, user) like the index itself. It used to be one directory
 * shared by every scope, which was harmless while nothing ever deleted from it:
 * embedded art is named by a hash of its *bytes*, so an album present both in an
 * on-device library and on a WebDAV share resolves to the same filename from two
 * different databases, and a prune driven by one scope's rows would have deleted
 * files the other scope still points at.
 *
 * Nothing is migrated. Files written before this was scoped stay at the parent
 * level, so the absolute paths already in `tracks.artwork_path` keep resolving;
 * nothing new is ever written there, and `pruneArtwork` only ever lists this
 * scope's own directory.
 */
export const artworkDir = (): Directory =>
  new Directory(Paths.document, "local-artwork", libraryScope());

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
    /**
     * Sidecar cover / artist filenames, most preferred first. Omitted or empty
     * falls back to the defaults — see services/local/artNames.ts.
     */
    albumArtNames?: readonly string[];
    artistArtNames?: readonly string[];
  } = {},
): Promise<ScanResult> {
  const { onProgress, controller, enrich = true, force = false } = opts;
  const albumArtNames = artNamesOrDefault(
    opts.albumArtNames,
    DEFAULT_ALBUM_ART_NAMES,
  );
  const artistArtNames = artNamesOrDefault(
    opts.artistArtNames,
    DEFAULT_ARTIST_ART_NAMES,
  );
  const result: ScanResult = {
    indexed: 0,
    skipped: 0,
    removed: 0,
    failed: 0,
    cancelled: false,
    incomplete: false,
    unreadable: 0,
    ignoredDirectories: 0,
    sidecarCovers: 0,
    artChanged: 0,
  };

  onProgress?.({ phase: "listing", processed: 0, total: 0 });

  // 1. Gather every audio file under the selected folders (de-duplicated by URI
  //    in case folders overlap or nest).
  const source = activeFileSource();
  const seen = new Map<string, ScannedFile>();
  const listed: ListingState = {
    dirs: 0,
    failed: 0,
    ignored: 0,
    art: new Map(),
    onProgress: (dirs) =>
      onProgress?.({
        phase: "listing",
        processed: 0,
        total: 0,
        directories: dirs,
      }),
  };
  for (const folder of folders) {
    if (controller?.cancelled) {
      result.cancelled = true;
      break;
    }
    try {
      const root = source.normalizeRoot(folder);
      // `exists` now answers false only when the source positively said the
      // path isn't there; anything else throws and lands below as a failure.
      // That distinction is what keeps a dropped link from reading as "the user
      // deleted this folder" — see services/fileSource/errors.ts.
      if (await source.exists(root)) {
        // Roots stay strictly sequential. Overlapping roots (`/Music` and
        // `/Music/Rock`) are settled by "first root to reach a URI wins", for
        // the file map and the art map alike; walking them together would make
        // which one that is depend on the link's mood.
        const completed = await walkRoot(
          {
            source,
            out: seen,
            listed,
            sourceFolder: folder,
            albumArtNames,
            artistArtNames,
            controller,
          },
          root,
        );
        if (!completed) {
          result.cancelled = true;
          break;
        }
      }
    } catch (error) {
      listed.failed++;
      logError(`[localLibrary] Failed to list folder ${folder}`, error);
    }
  }
  result.unreadable = listed.failed;
  // A cancelled walk stopped partway through the library by definition, so it is
  // incomplete even when every folder it did reach listed cleanly. Recorded on
  // the way out rather than at the `break` so a cancel keeps the listing counts
  // it earned — without them `maybeAutoScan` reads a stopped first scan as a
  // finished one and never resumes it.
  result.incomplete = listed.failed > 0 || result.cancelled;
  result.ignoredDirectories = listed.ignored;
  if (result.cancelled) return result;
  if (listed.ignored > 0) {
    reportBreadcrumb("local-library", "directories hidden by an ignore file", {
      ignored: listed.ignored,
      directories: listed.dirs,
    });
  }

  const db = await getLocalLibraryDb();

  // 2. Diff against the current index to find work (new/changed files only).
  const existing = await loadExistingRows(db);
  const work: ScannedFile[] = [];
  // Rows the walk saw but won't re-extract, whose stored directory is missing or
  // stale. `dir` was added for sidecar artwork and is the only field of a
  // skipped row that can be brought up to date without re-reading the file — and
  // it has to be, or an existing library would never resolve a cover until
  // something forced a full re-extraction.
  const rekey: { id: string; dir: string }[] = [];
  for (const file of seen.values()) {
    const prior = existing.get(file.uri);
    if (
      !force &&
      prior &&
      prior.mtime === file.mtime &&
      prior.size === file.size
    ) {
      result.skipped++;
      if (prior.dir !== file.dir) rekey.push({ id: prior.id, dir: file.dir });
    } else {
      work.push(file);
    }
  }
  // The walk lists directories concurrently, so the order it filled `seen` in is
  // the link's business rather than ours. Sorting here is the whole cost of a
  // reproducible extraction order — and of assertable tests.
  work.sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0));
  if (rekey.length > 0) {
    try {
      await db.withTransactionAsync(async () => {
        for (const row of rekey) {
          await db.runAsync(
            "UPDATE tracks SET dir = ? WHERE id = ?",
            row.dir,
            row.id,
          );
        }
      });
    } catch (error) {
      logError("[localLibrary] Failed to record track directories", error);
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
        const playable = source.playableUrl(file.uri);
        const metadata = await getAudioMetadata(playable, {
          artworkDir: dest.uri,
          enrich,
          openReader: () => source.openReader(file.uri),
          // Undefined for a `file://` URI; a network share's credentials for an
          // http(s) one. Same accessor every other native fetcher uses.
          headers: requestHeadersForUrl(playable),
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
    Array.from(
      { length: Math.min(source.extractConcurrency, work.length) },
      () => worker(),
    ),
  );
  await flush();

  // Stopping during extraction leaves files listed but not indexed, which is the
  // same partial library a failed listing produces — and the same thing
  // `maybeAutoScan` resumes.
  if (result.cancelled) result.incomplete = true;

  // One aggregated Issue per scan when the extraction failure *rate* is
  // material. A handful of unreadable files in a large library is normal — a
  // DRM'd track, a truncated download, a container the native reader doesn't
  // know — and the per-file breadcrumbs above already record those. What is
  // worth an Issue is a systematic failure (a whole folder, a codec the reader
  // regressed on), which shows up as a share of the scan rather than a count.
  if (
    result.failed >= MIN_SCAN_FAILURES_TO_REPORT &&
    result.failed / work.length >= MIN_SCAN_FAILURE_RATE_TO_REPORT
  ) {
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
  //    a run that didn't observe the full folder set can't tell a deleted file
  //    from one it simply never reached.
  //
  //    `cancelled` covers a user/controller stop. `incomplete` covers the case
  //    that matters on a network share: a directory that failed to list. Without
  //    it, a Wi-Fi drop or an expired credential mid-scan makes the share look
  //    empty and this loop deletes the entire library — including the tag
  //    corrections below, which cannot be recovered.
  //
  //    A folder hidden by an ignore file lands here too, and that is the
  //    intended outcome: hiding a folder is asking for it to leave the library.
  //    It costs its tracks' tag corrections, exactly as deleting the files
  //    would; their play counts survive in the dangling track_stats rows.
  //
  //    That is also why the count is reported to the user rather than only to
  //    Sentry (see `ignoredDirectories`): the very first scan after ignore-file
  //    support shipped acts on markers nobody put there for us — Android apps
  //    write `.nomedia` into Ringtones and thumbnail caches, and `.ignore` is
  //    ripgrep's config file — so the deletion has to be attributable.
  if (!result.cancelled && !result.incomplete) {
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
          // Unlike track_stats (which is left dangling so a returning file keeps
          // its play count), a tag correction is meaningless without the file it
          // corrects — and leaving it would silently re-apply to a *different*
          // file that later hashes to the same URI-derived id.
          await db.runAsync(
            "DELETE FROM track_tag_overrides WHERE track_id = ?",
            id,
          );
        }
      });
      result.removed = removable.length;
    }
  }

  // Every track written above had its FTS row rebuilt from the tags read off the
  // file, so any correction on a re-indexed track was just reverted. Restore
  // them before reporting the scan done.
  await reapplyOverridesAfterIndexing();

  // 5. Sidecar artwork: the `cover.jpg` / `front.png` / `artist.jpg` the walk
  //    collected. Runs last because both of its grouping rules read the
  //    *resolved* keys — the parent-folder rule counts the albums under a
  //    directory, the artist rule maps artists onto folders — and those are only
  //    right once the prune has dropped the deleted tracks and the corrections
  //    above are back in place.
  //
  //    Keyed by directory, not by track: the diff above skips every unchanged
  //    file, so an image dropped into an otherwise untouched folder has to be
  //    picked up by something that doesn't depend on a track being re-extracted.
  try {
    onProgress?.({
      phase: "artwork",
      processed: result.indexed,
      total: work.length,
    });
    const art = await applyFolderArt(db, source, listed.art, {
      complete: !result.cancelled && !result.incomplete,
      controller,
    });
    result.sidecarCovers = art.covers;
    result.artChanged = art.changed;
  } catch (error) {
    // Never fatal: a library with no covers is worse-looking, not broken, and
    // the tracks written above are already committed.
    logError("[localLibrary] Failed to resolve folder artwork", error);
  }

  // Artwork files nothing points at any more. Only ever this scope's own
  // directory, and only after a scan that saw the whole library — see
  // `artworkDir` for why the two matter.
  if (!result.cancelled && !result.incomplete) {
    try {
      await pruneArtwork(db);
    } catch (error) {
      logError("[localLibrary] Failed to prune orphaned artwork", error);
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

/**
 * Walk one configured root, listing up to `source.listConcurrency` directories
 * at a time. Returns false when the controller stopped it.
 *
 * The queue only ever grows from inside a running listing, so the pool has to
 * stay alive while anything is in flight rather than retiring the moment it
 * finds the queue empty — which is exactly why utils/mapWithConcurrency, whose
 * workers return for good on an exhausted array, doesn't fit here. At the root
 * the queue holds one entry, so that pool would collapse to serial on its first
 * tick.
 */
async function walkRoot(ctx: WalkContext, root: string): Promise<boolean> {
  const queue: PendingDir[] = [
    { path: root, depth: 0, relative: "", scopes: [] },
  ];
  // A cursor rather than shift(): the queue holds a whole level of a wide
  // library and is never re-read from the front.
  let cursor = 0;
  // A source can hand the same directory back under two names (an alias, or a
  // symlink loop MAX_DEPTH would otherwise have to absorb). Listing it twice
  // costs a round trip to reach the same conclusion.
  const queued = new Set([root]);
  const enqueue = (job: PendingDir): void => {
    if (queued.has(job.path)) return;
    queued.add(job.path);
    queue.push(job);
  };

  // Not just a floor: a non-finite value would make `inFlight < limit` false
  // forever, so the pump would resolve without listing anything and the walk
  // would report a complete, empty library — which step 4 prunes down to
  // nothing.
  const configured = ctx.source.listConcurrency;
  const limit = Number.isFinite(configured) ? Math.max(1, configured) : 1;
  let inFlight = 0;
  let stopped = false;

  await new Promise<void>((resolve) => {
    function settle(): void {
      inFlight--;
      pump();
    }
    function pump(): void {
      if (ctx.controller?.cancelled) stopped = true;
      while (!stopped && inFlight < limit && cursor < queue.length) {
        inFlight++;
        // Both arms, always: a directory that fails to list is already counted
        // inside visitDirectory, but an unexpected throw still has to free its
        // slot — leaving one occupied would hang the scan forever — and still
        // has to mark the walk incomplete, which is what keeps the prune off.
        visitDirectory(ctx, queue[cursor++], enqueue).then(settle, (error) => {
          ctx.listed.failed++;
          logError("[localLibrary] Directory walk failed", error);
          settle();
        });
      }
      if (inFlight === 0) resolve();
    }
    pump();
  });
  return !stopped;
}

/**
 * List one directory: record its audio files and its sidecar images, and queue
 * its subdirectories. Never rejects for a cause the walk expects — a directory
 * it can't read is counted, not thrown, so one unreadable folder can't take the
 * pool's other workers down with it.
 */
async function visitDirectory(
  ctx: WalkContext,
  job: PendingDir,
  enqueue: (job: PendingDir) => void,
): Promise<void> {
  const { source, out, listed } = ctx;
  const { path, depth, relative, scopes, parent } = job;
  if (depth > MAX_DEPTH) return;
  if (++listed.dirs % LIST_YIELD_EVERY === 0) {
    // The yield point is also the reporting point: emitting per directory would
    // thrash subscribers on a fast local tree, and this already fires often
    // enough to look continuous.
    listed.onProgress?.(listed.dirs);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  let entries: RemoteEntry[];
  try {
    entries = await source.list(path);
  } catch (error) {
    // Counted, not just logged. The walk still continues — one unreadable
    // folder shouldn't abandon the rest of the library — but the count marks
    // the scan incomplete, which is what stops the prune from deleting every
    // track this walk failed to reach.
    listed.failed++;
    logError(`[localLibrary] Failed to list ${path}`, error);
    return;
  }

  // `.ignore` / `.ndignore` / `.nomedia`, the convention Jellyfin, Navidrome and
  // Android's media scanner all implement (see ignoreRules.ts).
  let ignore: DirectoryIgnore;
  try {
    ignore = await readDirectoryIgnore(source, entries, relative);
  } catch (error) {
    // The file is there but we couldn't read it, so we don't know the rules.
    // Counting it as unreadable is what marks the scan incomplete and stops the
    // prune below — indexing the subtree anyway would surface folders the user
    // deliberately hid, and skipping it silently would delete them for good.
    listed.failed++;
    logError(`[localLibrary] Failed to read the ignore file in ${path}`, error);
    return;
  }
  if (ignore.kind === "excluded") {
    listed.ignored++;
    return;
  }
  const active = ignore.kind === "rules" ? [...scopes, ignore.scope] : scopes;

  // Everything the ignore rules leave in view, kept so the sidecar-image scan
  // below sees exactly what a user browsing the folder would. A `cover.jpg`
  // matched by an ignore pattern is hidden like anything else.
  const visible: RemoteEntry[] = [];
  // A directory two overlapping roots (`/Music` and `/Music/Rock`) both reach is
  // walked twice. The first visit's images win, like the file map below, but the
  // parent is taken from whichever visit knew one: reached *as* a root a
  // directory has none, and dropping that link would make cover inheritance for
  // the subtree depend on the order the roots happen to be walked in.
  const seenBefore = listed.art.get(path);
  const art: DirectoryArt = seenBefore ?? { parent, hasAudio: false };
  if (!seenBefore) listed.art.set(path, art);
  else if (!art.parent && parent) art.parent = parent;

  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (isIgnored(active, entryRelative, entry.isDirectory)) {
      if (entry.isDirectory) listed.ignored++;
      continue;
    }
    visible.push(entry);
    if (entry.isDirectory) {
      enqueue({
        path: entry.path,
        depth: depth + 1,
        relative: entryRelative,
        scopes: active,
        parent: path,
      });
    } else {
      if (!isAudioFile(entry.name)) continue;
      art.hasAudio = true;
      const claimed = out.get(entry.path);
      // First *root* to reach a URI still wins — roots are walked one after the
      // other. Within one root the listings race, so a file the source reports
      // from two directories is settled on the directory name rather than on
      // whichever listing happened to land first.
      if (
        claimed &&
        (claimed.sourceFolder !== ctx.sourceFolder || claimed.dir <= path)
      ) {
        continue;
      }
      out.set(entry.path, {
        uri: entry.path,
        name: entry.name,
        size: entry.size,
        mtime: entry.mtime,
        dir: path,
        sourceFolder: ctx.sourceFolder,
      });
    }
  }

  if (!seenBefore) {
    art.album = pickFolderImage(visible, ctx.albumArtNames);
    art.artist = pickFolderImage(visible, ctx.artistArtNames);
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
    dir: string | null;
  }>("SELECT id, uri, mtime, size, dir FROM tracks");
  const map = new Map<string, ExistingRow>();
  for (const row of rows) {
    map.set(row.uri, {
      id: row.id,
      mtime: row.mtime,
      size: row.size,
      dir: row.dir,
    });
  }
  return map;
}

// A flat record matching the `tracks` columns, ready to bind.
type TrackInsert = {
  id: string;
  uri: string;
  path: string;
  folder: string | null;
  dir: string;
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
    dir: file.dir,
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
  id, uri, path, folder, dir, size, mtime, title, artist, album, album_artist,
  composer, genre, year, track_number, track_total, disc_number, disc_total,
  duration_ms, bitrate, sample_rate, is_compilation, suffix, artwork_path,
  artwork_mime, lyrics, music_brainz_id, artists_json, replay_gain_json,
  release_types_json, album_key, artist_key, source_folder, indexed_at,
  -- Seeded from the scanned keys. A track carrying a correction has these put
  -- back by reapplyOverridesAfterIndexing once the scan finishes.
  resolved_album_key, resolved_artist_key
) VALUES (
  $id, $uri, $path, $folder, $dir, $size, $mtime, $title, $artist, $album,
  $album_artist, $composer, $genre, $year, $track_number, $track_total,
  $disc_number, $disc_total, $duration_ms, $bitrate, $sample_rate,
  $is_compilation, $suffix, $artwork_path, $artwork_mime, $lyrics,
  $music_brainz_id, $artists_json, $replay_gain_json, $release_types_json,
  $album_key, $artist_key, $source_folder, $indexed_at, $album_key, $artist_key
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
    $dir: row.dir,
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

// --- sidecar artwork -------------------------------------------------------

// An artist folder can hold hundreds of album folders. Past this the parent is
// obviously not one album's root, so the "does this parent hold a single album?"
// query is skipped rather than issued with a vast IN list.
const MAX_PARENT_SUBTREE_DIRS = 400;

type ArtworkRef = { path: string; mime: string };

type LibraryDb = Awaited<ReturnType<typeof getLocalLibraryDb>>;

const fileExists = (uri: string): boolean => {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

/**
 * Resolve, mirror and record every folder's sidecar artwork.
 *
 * Returns how many directories ended up with an album cover, and how many art
 * rows the scan actually rewrote — see `ScanResult.artChanged` for why both.
 */
async function applyFolderArt(
  db: LibraryDb,
  source: FileSource,
  dirs: Map<string, DirectoryArt>,
  opts: { complete: boolean; controller?: ScanController },
): Promise<{ covers: number; changed: number }> {
  const albumChoice = await resolveAlbumArt(db, dirs);
  const artistChoice = await resolveArtistArt(db, dirs);
  // An incomplete scan with nothing to add has nothing to say: it may not
  // delete, and there is no row to write.
  if (albumChoice.size === 0 && artistChoice.size === 0 && !opts.complete) {
    return { covers: 0, changed: 0 };
  }

  const dest = artworkDir();
  try {
    if (!dest.exists) dest.create({ intermediates: true });
  } catch (error) {
    logError("[localLibrary] Failed to create artwork dir", error);
    return { covers: 0, changed: 0 };
  }

  const priorFolders = await loadArtRows(db, "folder_art", "dir");
  const priorArtists = await loadArtRows(db, "artist_art", "artist_key");

  // One mirror per distinct image, however many folders point at it: a
  // multi-disc release resolves every disc directory to the same `cover.jpg`.
  const needed = new Map<string, RemoteEntry>();
  const consider = (
    key: string,
    entry: RemoteEntry,
    prior: Map<string, { artwork_path: string; source_key: string | null }>,
  ) => {
    const before = prior.get(key);
    const token = folderImageKey(entry);
    // An unchanged image whose mirror is still on disk needs no transfer at all
    // — the row already points at the right file. A missing token means the
    // source reported neither size nor mtime (a WebDAV server without
    // `getcontentlength`), so "unchanged" is unknowable and re-fetching is the
    // only way not to serve a stale cover.
    if (
      token &&
      before?.source_key === token &&
      fileExists(before.artwork_path)
    ) {
      return;
    }
    needed.set(entry.path, entry);
  };
  for (const [dir, entry] of albumChoice) consider(dir, entry, priorFolders);
  for (const [key, entry] of artistChoice) consider(key, entry, priorArtists);

  const mirrored = new Map<string, ArtworkRef>();
  const jobs = [...needed.values()];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      if (opts.controller?.cancelled) return;
      const entry = jobs[next++];
      const result = await mirrorFolderImage(source, entry, dest);
      if (result) mirrored.set(entry.path, result);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(source.extractConcurrency, jobs.length) },
      () => worker(),
    ),
  );

  const covers = await writeArtRows(db, {
    table: "folder_art",
    keyColumn: "dir",
    choices: albumChoice,
    prior: priorFolders,
    mirrored,
    // Only directories the walk actually reached may be cleared. A scan that
    // couldn't list a folder must not read that as "the cover is gone".
    observed: opts.complete ? new Set(dirs.keys()) : undefined,
  });
  const artists = await writeArtRows(db, {
    table: "artist_art",
    keyColumn: "artist_key",
    choices: artistChoice,
    prior: priorArtists,
    mirrored,
    // Artist keys aren't directories: a complete scan saw every one that still
    // has tracks, so anything else is stale by definition.
    observed: opts.complete ? new Set(artistChoice.keys()) : undefined,
  });
  return {
    covers: covers.resolved,
    changed: covers.changed + artists.changed,
  };
}

async function loadArtRows(
  db: LibraryDb,
  table: string,
  keyColumn: string,
): Promise<Map<string, { artwork_path: string; source_key: string | null }>> {
  const rows = await db.getAllAsync<{
    k: string;
    artwork_path: string;
    source_key: string | null;
  }>(`SELECT ${keyColumn} AS k, artwork_path, source_key FROM ${table}`);
  return new Map(
    rows.map((row) => [
      row.k,
      { artwork_path: row.artwork_path, source_key: row.source_key },
    ]),
  );
}

/**
 * Which image each audio-bearing directory should use.
 *
 * A directory's own `cover.jpg` always wins. Failing that it may inherit its
 * parent's — the `Album/cover.jpg` + `Album/CD1`/`CD2` layout — but only when
 * everything under that parent belongs to one album. Without the guard an
 * `Artist/folder.jpg` would be served as the cover of every album by that
 * artist, which is exactly the case Navidrome's `albumRootParent` exists to
 * exclude.
 */
async function resolveAlbumArt(
  db: LibraryDb,
  dirs: Map<string, DirectoryArt>,
): Promise<Map<string, RemoteEntry>> {
  const chosen = new Map<string, RemoteEntry>();
  const inherited: string[] = [];
  for (const [dir, state] of dirs) {
    if (!state.hasAudio) continue;
    if (state.album) {
      chosen.set(dir, state.album);
      continue;
    }
    if (state.parent && dirs.get(state.parent)?.album) inherited.push(dir);
  }
  if (inherited.length === 0) return chosen;

  const parents = new Set(
    inherited.map((dir) => dirs.get(dir)?.parent).filter(Boolean) as string[],
  );
  const subtrees = subtreesByRoot(dirs);
  const albumKeys = await albumKeysByDir(db);
  const eligible = new Set<string>();
  for (const parent of parents) {
    if (holdsOneAlbum(subtrees.get(parent), albumKeys)) eligible.add(parent);
  }
  for (const dir of inherited) {
    const parent = dirs.get(dir)?.parent;
    const image = parent ? dirs.get(parent)?.album : undefined;
    if (parent && image && eligible.has(parent)) chosen.set(dir, image);
  }
  return chosen;
}

/**
 * Every audio-bearing directory at or below each directory the walk observed,
 * indexed by that ancestor. Built in one pass over `dirs` rather than by
 * re-walking the whole map per candidate parent, which is quadratic on a
 * library with thousands of albums.
 */
function subtreesByRoot(
  dirs: Map<string, DirectoryArt>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [dir, state] of dirs) {
    if (!state.hasAudio) continue;
    let cursor: string | undefined = dir;
    while (cursor) {
      const members = out.get(cursor);
      if (members) members.push(dir);
      else out.set(cursor, [dir]);
      cursor = dirs.get(cursor)?.parent;
    }
  }
  return out;
}

/**
 * The distinct albums in each directory. Reads `resolved_album_key`, not the
 * scanned `album_key`: a multi-disc release the user merged with a tag
 * correction is one album to everything that lists the library, so it has to be
 * one album to the inheritance guard too (see SCHEMA_V6 in db.ts).
 */
async function albumKeysByDir(
  db: LibraryDb,
): Promise<Map<string, Set<string>>> {
  const rows = await db.getAllAsync<{ dir: string; k: string }>(
    `SELECT DISTINCT dir, resolved_album_key AS k FROM tracks
      WHERE dir IS NOT NULL AND resolved_album_key IS NOT NULL`,
  );
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const keys = out.get(row.dir);
    if (keys) keys.add(row.k);
    else out.set(row.dir, new Set([row.k]));
  }
  return out;
}

function holdsOneAlbum(
  members: string[] | undefined,
  albumKeys: Map<string, Set<string>>,
): boolean {
  if (!members || members.length === 0) return false;
  if (members.length > MAX_PARENT_SUBTREE_DIRS) return false;
  const seen = new Set<string>();
  for (const dir of members) {
    for (const key of albumKeys.get(dir) ?? []) {
      seen.add(key);
      if (seen.size > 1) return false;
    }
  }
  return seen.size === 1;
}

/**
 * Which `artist.jpg` each artist should use.
 *
 * An artist image applies to the artists whose tracks live under it, nearest
 * one winning — the same shape as Navidrome's `artist.*, album/artist.*` order,
 * read off the directory tree this walk observed rather than off path strings
 * (which a SAF `content://` URI does not give us).
 */
async function resolveArtistArt(
  db: LibraryDb,
  dirs: Map<string, DirectoryArt>,
): Promise<Map<string, RemoteEntry>> {
  const chosen = new Map<string, RemoteEntry>();
  let any = false;
  for (const state of dirs.values()) {
    if (state.artist) {
      any = true;
      break;
    }
  }
  if (!any) return chosen;

  // `resolved_artist_key`, because that is the column the artist list groups on
  // (`tracks_resolved` exposes it as `artist_key`) and the one `artist_art` is
  // read back against. Keying on the scanned value would hide the image of
  // every artist a tag correction renamed.
  const rows = await db.getAllAsync<{ artist_key: string; dir: string }>(
    `SELECT DISTINCT resolved_artist_key AS artist_key, dir FROM tracks
      WHERE dir IS NOT NULL
        AND resolved_artist_key IS NOT NULL
        AND resolved_artist_key <> ''`,
  );
  const best = new Map<string, { distance: number; dir: string }>();
  for (const row of rows) {
    let cursor: string | undefined = row.dir;
    let distance = 0;
    while (cursor) {
      const image = dirs.get(cursor)?.artist;
      if (image) {
        const current = best.get(row.artist_key);
        // Nearest wins; a tie is broken on the directory so two tracks of the
        // same artist can't resolve it differently depending on row order.
        if (
          !current ||
          distance < current.distance ||
          (distance === current.distance && cursor < current.dir)
        ) {
          best.set(row.artist_key, { distance, dir: cursor });
          chosen.set(row.artist_key, image);
        }
        break;
      }
      cursor = dirs.get(cursor)?.parent;
      distance += 1;
    }
  }
  return chosen;
}

async function writeArtRows(
  db: LibraryDb,
  opts: {
    table: string;
    keyColumn: string;
    choices: Map<string, RemoteEntry>;
    prior: Map<string, { artwork_path: string; source_key: string | null }>;
    mirrored: Map<string, ArtworkRef>;
    /** Keys the scan is authoritative about, so stale rows can be deleted. */
    observed?: Set<string>;
  },
): Promise<{ resolved: number; changed: number }> {
  const { table, keyColumn, choices, prior, mirrored, observed } = opts;
  const now = Date.now();
  const upserts: {
    key: string;
    path: string;
    mime: string | null;
    sourcePath: string;
    sourceKey: string | null;
  }[] = [];
  const resolved = new Set<string>();
  // Rows whose mirrored file is gone. Always deleted, even after an incomplete
  // scan: `tracks_resolved` coalesces the folder cover ahead of the track's own
  // embedded picture, so a row pointing at a file that no longer exists doesn't
  // just fail to help — it hides the artwork the tracks already carry.
  const orphaned: string[] = [];
  for (const [key, entry] of choices) {
    const fresh = mirrored.get(entry.path);
    if (fresh) {
      resolved.add(key);
      upserts.push({
        key,
        path: fresh.path,
        mime: fresh.mime,
        sourcePath: entry.path,
        sourceKey: folderImageKey(entry) ?? null,
      });
      continue;
    }
    // No fresh mirror: either the image was unchanged (the row already says the
    // right thing) or the copy failed, in which case the previous cover is still
    // better than none — as long as it is still there.
    const before = prior.get(key);
    if (!before) continue;
    if (fileExists(before.artwork_path)) resolved.add(key);
    else orphaned.push(key);
  }

  const doomed = new Set(orphaned);
  if (observed) {
    for (const key of prior.keys()) {
      if (!resolved.has(key) && (observed.has(key) || !choices.has(key))) {
        doomed.add(key);
      }
    }
  }

  const changed = upserts.length + doomed.size;
  if (changed === 0) return { resolved: resolved.size, changed };
  await db.withTransactionAsync(async () => {
    for (const row of upserts) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ${table}
           (${keyColumn}, artwork_path, artwork_mime, source_path, source_key, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.key,
        row.path,
        row.mime,
        row.sourcePath,
        row.sourceKey,
        now,
      );
    }
    for (const key of doomed) {
      await db.runAsync(`DELETE FROM ${table} WHERE ${keyColumn} = ?`, key);
    }
  });
  return { resolved: resolved.size, changed };
}

/**
 * Delete artwork files nothing in this scope's index points at any more.
 *
 * Deliberately narrow: it lists one directory — this scope's own, never
 * recursing — so it cannot reach another scope's covers, the offline downloads'
 * artwork (`Paths.document/offline/<scope>/artwork`), the reclaimable mirrors
 * under `Paths.cache`, or the Cover Art Archive covers in
 * `Paths.document/musicbrainz-artwork`. Comparison is on the filename rather
 * than the full URI, so a stored path that spells the same file differently
 * can't read as unreferenced.
 */
async function pruneArtwork(db: LibraryDb): Promise<void> {
  const dir = artworkDir();
  if (!dir.exists) return;
  const referenced = persistedArtworkNames();
  const sources = [
    "SELECT DISTINCT artwork_path AS p FROM tracks WHERE artwork_path IS NOT NULL",
    "SELECT DISTINCT artwork_path AS p FROM folder_art",
    "SELECT DISTINCT artwork_path AS p FROM artist_art",
    "SELECT DISTINCT artwork_path AS p FROM track_tag_overrides WHERE artwork_path IS NOT NULL",
  ];
  for (const sql of sources) {
    for (const row of await db.getAllAsync<{ p: string }>(sql)) {
      const name = row.p.split("/").pop();
      if (name) referenced.add(name);
    }
  }
  for (const entry of dir.list()) {
    // Subdirectories are not ours to walk, and there shouldn't be any.
    if (!(entry instanceof File)) continue;
    if (referenced.has(entry.name)) continue;
    try {
      entry.delete();
    } catch (error) {
      logError(`[localLibrary] Failed to delete ${entry.name}`, error);
    }
  }
}
