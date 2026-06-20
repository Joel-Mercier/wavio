// Runs `task` over `items` with at most `limit` promises in flight at once, so a
// large fan-out doesn't open dozens of simultaneous requests — which trips
// server-side rate limits and returns HTTP 429 (see the Android Auto browse-tree
// prefetch in services/carAuto/tree.ts). Results preserve input order, like
// Promise.all. Rejections propagate; pass tasks that catch their own errors when
// partial failures should not abort the whole batch.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
