import type { QueueSource, QueueTrack } from "@/stores/queue";
import type { RecentPlay } from "@/stores/recentPlays";

export const FAVORITES_QUEUE_SOURCE_ID = "favorites";

export const recentPlayKey = (recentPlay: Pick<RecentPlay, "type" | "id">) =>
  `${recentPlay.type}:${recentPlay.id}`;

export function activeRecentPlayKey(
  source: QueueSource,
  playingTrack: QueueTrack | null | undefined,
): string | null {
  if (!playingTrack) return null;
  if (playingTrack.isRadio) {
    return recentPlayKey({ type: "internetRadioStation", id: playingTrack.id });
  }
  if (!source?.id) return null;
  switch (source.type) {
    case "album":
    case "playlist":
    case "artist":
      return recentPlayKey({ type: source.type, id: source.id });
    case "allSongs":
      return recentPlayKey({ type: "artist", id: source.id });
    case "likedSongs":
      return source.id === FAVORITES_QUEUE_SOURCE_ID
        ? recentPlayKey({ type: "favorites", id: "favorites" })
        : recentPlayKey({ type: "artist", id: source.id });
    default:
      return null;
  }
}
