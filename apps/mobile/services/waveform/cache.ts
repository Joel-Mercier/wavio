import { getLocalLibraryDb } from "@/services/local/db";
import { logError } from "@/utils/log";

// Bump when the extraction algorithm changes shape enough that stored rows would
// look different from freshly decoded ones. Every row below this is ignored and
// re-decoded on demand.
export const WAVEFORM_VERSION = 1;

// How many envelope values are stored per track. Chosen so even a wide landscape
// tablet (~200 bars) still has ~5 source buckets per drawn bar, which keeps the
// JS downsample free of aliasing. At one byte per bucket a row is ~1 KB.
export const WAVEFORM_BUCKETS = 1024;

// ~5 MB of peaks at the row size above. Waveforms are pure cache, so the ceiling
// only decides how often a long-tail track has to be decoded twice.
const MAX_ROWS = 5000;

// Failure rows are budgeted separately (see pruneWaveforms). A library only has
// so many genuinely undecodable tracks; this is a ceiling, not a target.
const MAX_FAILED_ROWS = 1000;

// A transient failure (server unreachable, file briefly missing) must not
// blackhole a track forever, but retrying it on every track change is just as
// bad. Back off for a day.
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

// `last_used_at` exists only to order eviction, so writing it on every read
// would be a SQLite write per track change for no benefit. An hour of
// granularity orders a 5000-row table just as well.
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type CachedWaveform = {
  peaks: Uint8Array;
  durationMs: number;
};

type WaveformRow = {
  peaks: Uint8Array | null;
  bucket_count: number;
  duration_ms: number;
  status: string;
  fingerprint: string | null;
  attempts: number;
  last_used_at: number;
};

/**
 * Look up a track's cached envelope.
 *
 * Returns the peaks on a hit, `"pending"` when nothing usable is stored (so the
 * caller should decode), or `"skip"` when a stored failure says decoding this
 * track is either impossible or not worth retrying yet.
 */
export async function readWaveform(
  id: string,
  fingerprint: string | null,
): Promise<CachedWaveform | "pending" | "skip"> {
  try {
    const db = await getLocalLibraryDb();
    const row = await db.getFirstAsync<WaveformRow>(
      "SELECT peaks, bucket_count, duration_ms, status, fingerprint, attempts, last_used_at FROM waveforms WHERE id = ? AND version = ?",
      [id, WAVEFORM_VERSION],
    );
    if (!row) return "pending";

    // Only local-library rows carry a fingerprint; a mismatch means the file
    // behind a stable id was replaced, so the stored shape is of other audio.
    if (fingerprint != null && row.fingerprint !== fingerprint) {
      await db.runAsync("DELETE FROM waveforms WHERE id = ?", [id]);
      return "pending";
    }

    if (row.status === "failed") {
      return Date.now() - row.last_used_at > RETRY_AFTER_MS
        ? "pending"
        : "skip";
    }
    if (!row.peaks || row.peaks.length === 0) return "pending";

    touch(id, row.last_used_at);
    return {
      peaks: new Uint8Array(row.peaks),
      durationMs: row.duration_ms,
    };
  } catch (error) {
    logError("[waveform] Failed to read cache", error);
    return "pending";
  }
}

export async function writeWaveform(
  id: string,
  peaks: Uint8Array,
  durationMs: number,
  fingerprint: string | null,
): Promise<void> {
  const now = Date.now();
  try {
    const db = await getLocalLibraryDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO waveforms (id, peaks, bucket_count, duration_ms, status, fingerprint, version, attempts, created_at, last_used_at) VALUES (?, ?, ?, ?, 'ok', ?, ?, 0, ?, ?)",
      [
        id,
        peaks,
        peaks.length,
        Math.round(durationMs),
        fingerprint,
        WAVEFORM_VERSION,
        now,
        now,
      ],
    );
  } catch (error) {
    logError("[waveform] Failed to write cache", error);
  }
}

/**
 * Record a decode failure. `permanent` failures (unsupported codec, corrupt
 * file) are stored so the track is never attempted again; transient ones are
 * stored too, but only to hold off the retry — see RETRY_AFTER_MS.
 */
export async function writeWaveformFailure(
  id: string,
  fingerprint: string | null,
  permanent: boolean,
): Promise<void> {
  const now = Date.now();
  // A permanent failure is dated far enough ahead that the transient back-off
  // can never expire it, so one column drives both cases.
  const lastUsedAt = permanent ? now + RETRY_AFTER_MS * 365 * 100 : now;
  try {
    const db = await getLocalLibraryDb();
    await db.runAsync(
      `INSERT INTO waveforms (id, peaks, bucket_count, duration_ms, status, fingerprint, version, attempts, created_at, last_used_at)
       VALUES (?, NULL, 0, 0, 'failed', ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'failed', peaks = NULL, bucket_count = 0,
         fingerprint = excluded.fingerprint, version = excluded.version,
         attempts = waveforms.attempts + 1, last_used_at = excluded.last_used_at`,
      [id, fingerprint, WAVEFORM_VERSION, now, lastUsedAt],
    );
  } catch (error) {
    logError("[waveform] Failed to record failure", error);
  }
}

// Fire-and-forget: never awaited on a render path, and a lost touch only makes
// this row marginally more likely to be evicted.
function touch(id: string, lastUsedAt: number): void {
  const now = Date.now();
  if (now - lastUsedAt < TOUCH_INTERVAL_MS) return;
  void (async () => {
    try {
      const db = await getLocalLibraryDb();
      await db.runAsync("UPDATE waveforms SET last_used_at = ? WHERE id = ?", [
        now,
        id,
      ]);
    } catch {
      // Eviction ordering only; not worth reporting.
    }
  })();
}

let pruned = false;

/**
 * Trim the cache, keeping the most recently used peaks. Once per session.
 *
 * The two kinds of row get separate budgets because they can't share an
 * eviction ordering: a permanent failure's `last_used_at` is dated a century
 * ahead so the retry back-off can never expire it, which would also make it
 * outrank every real waveform and evict the peaks actually in use. Failures are
 * aged out on `created_at` instead, which is a real timestamp for both kinds.
 */
export async function pruneWaveforms(): Promise<void> {
  if (pruned) return;
  pruned = true;
  try {
    const db = await getLocalLibraryDb();
    await db.runAsync(
      `DELETE FROM waveforms WHERE status != 'failed' AND id NOT IN
         (SELECT id FROM waveforms WHERE status != 'failed' ORDER BY last_used_at DESC LIMIT ?)`,
      [MAX_ROWS],
    );
    await db.runAsync(
      `DELETE FROM waveforms WHERE status = 'failed' AND id NOT IN
         (SELECT id FROM waveforms WHERE status = 'failed' ORDER BY created_at DESC LIMIT ?)`,
      [MAX_FAILED_ROWS],
    );
  } catch (error) {
    logError("[waveform] Failed to prune cache", error);
  }
}

export async function clearWaveforms(): Promise<void> {
  try {
    const db = await getLocalLibraryDb();
    await db.runAsync("DELETE FROM waveforms");
  } catch (error) {
    logError("[waveform] Failed to clear cache", error);
  }
}

/** Test seam: lets a suite re-exercise the once-per-session prune. */
export function __resetPruneGuard(): void {
  pruned = false;
}
