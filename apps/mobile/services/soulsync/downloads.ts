import { soulSyncRequest } from "@/services/soulsync";
import type {
  SoulSyncDownloadsResponse,
  SoulSyncDownloadTask,
} from "@/services/soulsync/types";

// Statuses SoulSync reports for a task that is still in flight; everything else
// (completed, failed, cancelled) is terminal.
const ACTIVE_STATUSES = new Set([
  "queued",
  "searching",
  "downloading",
  "pending",
  "matched",
  "post_processing",
]);

// `album_name` is only sometimes a string. When the task carries no explicit
// album the endpoint falls back to the stored track payload's `album`, which is
// the `{name, images}` object the wishlist requires — so the better our payload
// is, the more often this arrives as an object. Rendering it straight into a
// <Text> would throw ("Objects are not valid as a React child"), so every read
// goes through here.
export function albumNameOf(task: SoulSyncDownloadTask): string | null {
  const album = task.album_name;
  if (!album) return null;
  if (typeof album === "string") return album;
  return album.name ?? null;
}

// /downloads carries no track id, so a task is tied back to the request that
// started it — and to its wishlist row, the only place cover art lives — by
// name + artist. Both sides come from the payload we posted, so this is an
// exact match after normalising, not a fuzzy one.
export function downloadMatchKey(
  name: string | null | undefined,
  artist: string | null | undefined,
) {
  return `${(name ?? "").trim().toLowerCase()}|${(artist ?? "")
    .trim()
    .toLowerCase()}`;
}

// One entry per album, aggregating the per-track rows SoulSync returns. It has
// no album-level queue: tasks belonging to one grab share a `batch_id`.
export interface SoulSyncQueueItem {
  id: string;
  // One per aggregated task, for resolving the row's cover art.
  matchKeys: string[];
  albumTitle: string;
  artistName: string;
  size: number;
  percentComplete: number;
  trackCount: number;
  isActive: boolean;
  status?: string;
  errorMessage?: string;
}

function groupByBatch(tasks: SoulSyncDownloadTask[]): SoulSyncQueueItem[] {
  const byKey = new Map<string, SoulSyncDownloadTask[]>();
  for (const task of tasks) {
    // Prefer batch_id (one grab); fall back to artist + album so a set of
    // single-track requests for the same album still collapses into one row —
    // the artist is part of the key because two artists can share an album
    // title ("Greatest Hits") and merging those would show one row under an
    // arbitrary artist. Finally the task id, so an orphan still shows up.
    const albumName = albumNameOf(task);
    const key = task.batch_id
      ? `batch-${task.batch_id}`
      : albumName
        ? `album-${task.artist_name ?? ""}|${albumName}`
        : `task-${task.id}`;
    const arr = byKey.get(key) ?? [];
    arr.push(task);
    byKey.set(key, arr);
  }

  const out: SoulSyncQueueItem[] = [];
  for (const [key, arr] of byKey) {
    const first = arr[0];
    const size = arr.reduce((s, t) => s + (t.size ?? 0), 0);
    // SoulSync reports progress per track as 0-100; the album figure is their
    // mean, which matches what the user sees advancing.
    const percentComplete = Math.round(
      arr.reduce((s, t) => s + (t.progress ?? 0), 0) / arr.length,
    );
    out.push({
      id: key,
      matchKeys: arr.map((t) => downloadMatchKey(t.track_name, t.artist_name)),
      albumTitle: albumNameOf(first) || first.track_name || "Unknown album",
      artistName: first.artist_name || "Unknown artist",
      size,
      percentComplete: Math.min(100, Math.max(0, percentComplete)),
      trackCount: arr.length,
      isActive: arr.some((t) => ACTIVE_STATUSES.has(t.status ?? "")),
      status: first.status,
      errorMessage: arr.find((t) => t.error)?.error ?? undefined,
    });
  }
  return out;
}

// Ungrouped tasks, for callers that need to find one specific track rather than
// render the queue.
export async function fetchDownloadTasks(): Promise<SoulSyncDownloadTask[]> {
  const data = await soulSyncRequest<SoulSyncDownloadsResponse>("/downloads", {
    params: { limit: 200 },
  });
  return data?.downloads ?? [];
}

export async function fetchQueue(): Promise<SoulSyncQueueItem[]> {
  return groupByBatch(await fetchDownloadTasks());
}

export function isActiveTaskStatus(status: string | null | undefined) {
  return ACTIVE_STATUSES.has(status ?? "");
}

// Cancelling is deliberately not offered. /api/v1 has both a per-task and a
// cancel-all endpoint, and neither is usable: they act only on the slskd
// transfer and never touch the task tracker /downloads reads, so every row
// keeps reporting the status it had and the batch worker retries anyway. The
// per-task one can't even reach slskd — it's handed the task uuid /downloads
// exposes as `id`, while slskd needs the separate transfer id the endpoint
// never returns. Cancel from SoulSync's own UI instead.
