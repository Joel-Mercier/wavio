import { useMemo } from "react";
import { useCurrentAuthScope } from "@/stores/auth";
import {
  podcastPlayedBucket,
  podcastPlayedKey,
  usePodcastPlayedBase,
} from "@/stores/podcastPlayed";
import type { PodcastSource } from "@/stores/podcasts";

// Selects one episode's flag rather than the map, so marking a row re-renders
// only that row.
export default function usePodcastPlayed(
  id: string | undefined,
  source: PodcastSource,
): boolean {
  const bucket = podcastPlayedBucket(source, useCurrentAuthScope());
  const key = id ? podcastPlayedKey(id) : undefined;
  return usePodcastPlayedBase((state) =>
    key && bucket ? state.played[bucket]?.[key] !== undefined : false,
  );
}

// How many of `ids` are marked played. A number, so a mark elsewhere in the
// bucket that doesn't change it re-renders nothing.
export function usePodcastPlayedCount(
  ids: string[],
  source: PodcastSource,
): number {
  const bucket = podcastPlayedBucket(source, useCurrentAuthScope());
  const keys = useMemo(() => ids.map(podcastPlayedKey), [ids]);
  return usePodcastPlayedBase((state) => {
    const played = bucket ? state.played[bucket] : undefined;
    if (!played) return 0;
    let count = 0;
    for (const key of keys) if (played[key] !== undefined) count++;
    return count;
  });
}
