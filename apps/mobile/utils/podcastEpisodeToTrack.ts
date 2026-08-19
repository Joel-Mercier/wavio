import { streamUrl } from "@/services/backend/streaming";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import type { PodcastEpisode as TaddyPodcastEpisode } from "@/services/taddyPodcasts/types";
import useOffline from "@/stores/offline";
import type { PodcastProgressEntry } from "@/stores/podcasts";
import type { QueueTrack } from "@/stores/queue";
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
    // Both podcast id-spaces reach the player as source: "podcast", so the
    // origin has to be stamped explicitly — and `url` alone can't be reversed
    // back into what to stream, since a self-hosted episode's url is a
    // third-party enclosure just like a Taddy one's.
    podcastSource: "server" as const,
    streamId: streamableId,
    channelId: episode.channelId,
    description: episode.description,
    isOffline: !!offlineTrack,
  };
}

// Builds a player track from a Taddy podcast episode. Taddy episodes stream
// their third-party enclosure directly — the server knows nothing about them.
export function taddyEpisodeToTrack(
  episode: TaddyPodcastEpisode,
  fallbackSeriesName?: string,
) {
  return {
    // A screen reached through expo-router reads its episode out of
    // useLocalSearchParams, where `uuid` may be absent (it arrives as `id`) and
    // every value is a string — hence the fallback and the duration coercion.
    id: episode.uuid || (episode as unknown as { id: string }).id,
    url: episode.audioUrl,
    title: episode.name,
    artist: fallbackSeriesName || episode.podcastSeries?.name,
    artwork: episode.imageUrl,
    duration:
      typeof episode.duration === "string"
        ? Number(episode.duration)
        : episode.duration,
    source: "podcast" as const,
    podcastSource: "taddy" as const,
    audioUrl: episode.audioUrl,
    seriesUuid: episode.podcastSeries?.uuid,
    description: episode.description,
    websiteUrl: episode.websiteUrl,
    datePublished: episode.datePublished,
    podcastSeries: episode.podcastSeries,
  };
}

// Rebuilds a playable track from a stored progress entry. The entry keeps the
// *inputs* to the stream URL rather than a baked one (which would carry
// credentials and a route that only routeSwap.ts's live-queue pass repoints), so
// the URL is resolved here with the same offline-first rule as the builders above.
export function podcastProgressEntryToTrack(
  entry: PodcastProgressEntry,
): QueueTrack {
  const offlineTrack = useOffline.getState().getDownloadedTrack(entry.id);
  const url = offlineTrack
    ? offlineTrack.path
    : entry.source === "taddy"
      ? (entry.audioUrl ?? "")
      : streamUrl(entry.streamId ?? entry.id);

  return {
    id: entry.id,
    url,
    title: entry.title,
    artist: entry.seriesName,
    artwork:
      entry.artwork ??
      (entry.coverArt ? artworkUrl(entry.coverArt) : undefined),
    coverArt: entry.coverArt,
    duration: entry.duration,
    source: "podcast" as const,
    podcastSource: entry.source,
    streamId: entry.streamId,
    audioUrl: entry.audioUrl,
    channelId: entry.channelId,
    seriesUuid: entry.seriesUuid,
    isOffline: !!offlineTrack,
  };
}

// The network URL a podcast episode streams from, for consumers that can't use
// a local file — a Cast receiver fetches the media itself, so it needs a URL it
// can reach. Never `streamUrl(track.id)`: that is a Subsonic endpoint, and a
// Taddy episode's id is a uuid the server has never heard of.
export function podcastStreamUrl(track: QueueTrack): string | undefined {
  const url = typeof track.url === "string" ? track.url : "";
  // Already reachable: a Taddy or RSS enclosure, or the server's own stream
  // endpoint, baked in when the track was built.
  if (url && !url.startsWith("file://")) return url;
  // A downloaded episode plays off disk locally, so rebuild from the inputs.
  if (typeof track.audioUrl === "string" && track.audioUrl) {
    return track.audioUrl;
  }
  if (typeof track.streamId === "string" && track.streamId) {
    return streamUrl(track.streamId);
  }
  // Last resort for a queue entry built before the builders stamped those:
  // streamUrl decodes a `local-pod-ep-` id back to its enclosure, and for a
  // server episode the id is the closest thing left to a streamId.
  return streamUrl(track.id);
}

// A podcast episode can only be played once the server has finished
// downloading its media (status "completed" and a streamId is present).
export function isPlayablePodcastEpisode(episode: PodcastEpisode): boolean {
  return !!episode.streamId && episode.status === "completed";
}
