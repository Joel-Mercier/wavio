import type { Line } from "@/services/openSubsonic/types";

export function findCurrentLineIndex(
  lines: Line[],
  positionMs: number,
): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lines[mid].start ?? 0;
    if (start <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
