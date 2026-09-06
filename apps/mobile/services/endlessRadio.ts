import type { Child } from "@/services/openSubsonic/types";
import { fetchSimilarSongs } from "@/services/similarSongs";
import { fetchTopSongs } from "@/services/topSongs";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";

const FETCH_COUNT = 20;

export async function fetchEndlessExtension(
  seed: QueueTrack,
): Promise<QueueTrack[]> {
  let songs: Child[] = [];

  try {
    // The seed's own metadata is passed alongside the id because the Last.fm
    // tier identifies a track by name, not by the active server's id.
    songs = await fetchSimilarSongs(seed.id, FETCH_COUNT, {
      title: seed.title,
      artist: seed.artist,
      musicBrainzId: (seed as { musicBrainzId?: string }).musicBrainzId,
    });
  } catch {
    songs = [];
  }

  // Only `artists[0]` is the track's own artist — `artistId` is the album
  // artist, so seeding from it would extend a compilation track with "Various
  // Artists" instead of the artist actually playing. Without it we go by name,
  // which fetchTopSongs resolves on every backend.
  const artistId = seed.artists?.[0]?.id;

  if (songs.length === 0 && (artistId || seed.artist)) {
    try {
      songs = await fetchTopSongs({
        id: artistId,
        name: seed.artist,
        count: FETCH_COUNT,
      });
    } catch {
      songs = [];
    }
  }

  if (songs.length === 0) return [];

  const existingIds = new Set(useQueue.getState().queue.map((t) => t.id));
  return (
    songs
      .filter((s) => !existingIds.has(s.id))
      // Marked as picked by the app rather than by the listener. Last.fm's
      // track.scrobble takes this as `chosenByUser` and weights its
      // recommendations with it, defaulting to "the user chose this" — so an
      // untagged endless-radio play quietly overstates the listener's intent.
      .map((s) => ({ ...childToTrack(s), autoQueued: true }))
  );
}
