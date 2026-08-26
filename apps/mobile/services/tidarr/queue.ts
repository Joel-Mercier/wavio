import { tidarrRequest } from "@/services/tidarr";
import type {
  TidarrQueueItem,
  TidarrQueueResponse,
} from "@/services/tidarr/types";

const QUEUE_PAGE_SIZE = 100;

export async function fetchQueue(): Promise<TidarrQueueItem[]> {
  const data = await tidarrRequest<TidarrQueueResponse>("/queue/list", {
    params: { offset: 0, limit: QUEUE_PAGE_SIZE },
    // Polled every 15s, so a rejected key would emit one event per poll. It's a
    // config state the user fixes on the Tidarr screen, not a bug.
    unauthorizedIsExpected: true,
  });
  return data?.queue ?? [];
}

export async function removeQueueItem(id: string): Promise<void> {
  await tidarrRequest<void>("/remove", { method: "DELETE", data: { id } });
}

// Drops every finished *and* errored item at once. Tidarr never clears them
// itself, so without this the queue only ever grows.
export async function removeFinishedItems(): Promise<void> {
  await tidarrRequest<void>("/remove-finished", { method: "DELETE" });
}

// Resets every errored item back to queue_download. Tidarr has no per-item
// retry, so the Downloads screen offers this only when something has failed.
export async function retryFailed(): Promise<void> {
  await tidarrRequest<void>("/retry-failed", { method: "POST" });
}

// Reached its end state: Tidarr keeps these in the queue until they are removed.
export function isSettledItem(item: TidarrQueueItem): boolean {
  return item.status === "finished" || item.status === "error";
}

export function hasFailedItems(items: TidarrQueueItem[]): boolean {
  return items.some((item) => item.status === "error" || item.error);
}

// Items that reached `finished` since the last poll. Tidarr leaves finished
// items in the queue — they only ever leave through an explicit remove — so an
// item that merely disappeared was cancelled, not completed, and must not
// trigger a library scan.
export function detectFinishedQueueItems(
  previous: TidarrQueueItem[],
  current: TidarrQueueItem[],
): TidarrQueueItem[] {
  if (!previous.length) return [];
  const currentById = new Map(current.map((item) => [item.id, item]));
  return previous.filter(
    (item) =>
      !isSettledItem(item) && currentById.get(item.id)?.status === "finished",
  );
}
