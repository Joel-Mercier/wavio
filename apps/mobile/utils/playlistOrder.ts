import type { Child } from "@/services/openSubsonic/types";

// Applies a locally-saved custom order (an ordered list of track ids) to the
// server's playlist entries. Matching is done by consuming entries id-by-id, so
// a track that appears multiple times keeps its distinct slots instead of every
// copy collapsing onto a single position. Entries added since the order was
// saved (ids not in `order`) are appended in server order.
export function orderPlaylistEntries(
  entries: Child[],
  order: string[] | undefined,
): Child[] {
  if (!order || order.length === 0) {
    return [...entries];
  }
  const buckets = new Map<string, Child[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.id);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(entry.id, [entry]);
    }
  }
  const ordered: Child[] = [];
  for (const id of order) {
    const bucket = buckets.get(id);
    if (bucket?.length) {
      ordered.push(bucket.shift() as Child);
    }
  }
  const placed = new Set(ordered);
  for (const entry of entries) {
    if (!placed.has(entry)) {
      ordered.push(entry);
    }
  }
  return ordered;
}
