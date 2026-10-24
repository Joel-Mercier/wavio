import type { AlbumID3 } from "@/services/openSubsonic/types";

// Array.prototype.sort is stable, so albums sharing a play count keep the order
// they came in — fed a random pool, ties stay shuffled.
export function leastPlayed(albums: AlbumID3[], size: number): AlbumID3[] {
  return [...albums]
    .sort((a, b) => (a.playCount ?? 0) - (b.playCount ?? 0))
    .slice(0, size);
}
