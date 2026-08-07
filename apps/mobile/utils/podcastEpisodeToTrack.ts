import { streamUrl } from "@/services/backend/streaming";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";

// Feeds rarely give every episode its own artwork, so an episode without one
// wears its channel's: the channel's cover id when it has one (it resolves
// through the artwork cache offline like any other id), otherwise the feed image
// URL the channel carries directly.
function episodeArtwork(
  episode: PodcastEpisode,
  channel?: PodcastChannel,
): { coverArt?: string; artwork?: string } {
  const coverArt = episode.coverArt || channel?.coverArt;
  return {
    coverArt,
    artwork: coverArt ? artworkUrl(coverArt) : channel?.originalImageUrl,
  };
}

// Builds a player track from a Subsonic podcast episode. Podcast episodes are
// streamed through their `streamId` (the underlying media file the server
// downloaded), falling back to the episode id. Episodes without a streamId are
// not yet downloaded on the server and therefore not playable.
export function podcastEpisodeToTrack(
  episode: PodcastEpisode,
  fallbackSeriesName?: string,
  channel?: PodcastChannel,
) {
  const streamableId = episode.streamId ?? episode.id;
  const offlineStore = useOffline.getState();
  const offlineTrack = offlineStore.getDownloadedTrack(streamableId);
  const url = offlineTrack ? offlineTrack.path : streamUrl(streamableId);

  return {
    id: episode.id,
    url,
    title: episode.title,
    artist: episode.artist || fallbackSeriesName,
    ...episodeArtwork(episode, channel),
    duration: episode.duration,
    contentType: episode.contentType,
    source: "podcast" as const,
    description: episode.description,
    isOffline: !!offlineTrack,
  };
}

// A podcast episode can only be played once the server has finished
// downloading its media (status "completed" and a streamId is present).
export function isPlayablePodcastEpisode(episode: PodcastEpisode): boolean {
  return !!episode.streamId && episode.status === "completed";
}
