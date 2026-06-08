import { getTopSongs } from "@/services/backend/browsing";
import type { Child } from "@/services/openSubsonic/types";
import { fetchSimilarSongs } from "@/services/similarSongs";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";

const FETCH_COUNT = 20;

export async function fetchEndlessExtension(
  seed: QueueTrack,
): Promise<QueueTrack[]> {
  let songs: Child[] = [];

  try {
    songs = await fetchSimilarSongs(seed.id, FETCH_COUNT);
  } catch {
    songs = [];
  }

  if (songs.length === 0 && seed.artist) {
    try {
      const rsp = await getTopSongs(seed.artist, { count: FETCH_COUNT });
      songs = rsp.topSongs?.song ?? [];
    } catch {
      songs = [];
    }
  }

  if (songs.length === 0) return [];

  const existingIds = new Set(useQueue.getState().queue.map((t) => t.id));
  return songs
    .filter((s) => !existingIds.has(s.id))
    .map((s) => childToTrack(s));
}
