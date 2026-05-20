import { getSimilarSongs2, getTopSongs } from "@/services/backend/browsing";
import type { Child } from "@/services/openSubsonic/types";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";

const FETCH_COUNT = 20;

export async function fetchEndlessExtension(
  seed: QueueTrack,
): Promise<QueueTrack[]> {
  let songs: Child[] = [];

  try {
    const rsp = await getSimilarSongs2(seed.id, { count: FETCH_COUNT });
    songs = rsp.similarSongs2?.song ?? [];
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
