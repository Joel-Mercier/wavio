// Maps `items` synchronously in slices of `chunkSize`, yielding to the event
// loop between slices. `Array.map` over a few thousand items is individually
// cheap but never yields, and on the JS thread that is the whole app frozen for
// the duration — the Android Auto browse tree maps every track of every
// playlist (services/carAuto/tree.ts, issue #205). Results preserve input order.
export async function mapInChunks<T, R>(
  items: readonly T[],
  chunkSize: number,
  fn: (item: T, index: number) => R,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  for (let start = 0; start < items.length; start += chunkSize) {
    if (start > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const end = Math.min(start + chunkSize, items.length);
    for (let index = start; index < end; index++) {
      results[index] = fn(items[index], index);
    }
  }
  return results;
}
