/**
 * Splits `items` into consecutive slices of at most `size`, preserving order.
 * Returns an empty array for an empty input.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
