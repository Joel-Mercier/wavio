import { getPodcasts } from "@/services/backend/podcasts";
import { getPodcastSeries } from "@/services/taddyPodcasts/podcasts";
import type { PodcastEpisode as TaddyPodcastEpisode } from "@/services/taddyPodcasts/types";
import { currentAuthScope } from "@/stores/auth";
import {
  podcastPlayedBucket,
  usePodcastPlayedBase,
} from "@/stores/podcastPlayed";
import usePodcasts, { podcastFavoritesForScope } from "@/stores/podcasts";
import type { QueueTrack } from "@/stores/queue";
import {
  isPlayablePodcastEpisode,
  podcastEpisodeToTrack,
  taddyEpisodeToTrack,
} from "@/utils/podcastEpisodeToTrack";
import { encodeMediaId, episodeId, type PodcastSource } from "../mediaId";
import { cover } from "../nodes";
import type { BrowseNode } from "../types";
import type { Listing } from "./shared";

const EPISODE_LIMIT = 50;

export function podcastsListing(): Listing {
  const favorites = podcastFavoritesForScope(
    usePodcasts.getState().favoritePodcasts,
    currentAuthScope(),
  );
  return {
    nodes: favorites.map(
      (podcast): BrowseNode => ({
        id: encodeMediaId({
          kind: "podcast",
          source: podcast.source,
          id: podcast.uuid,
        }),
        title: podcast.name,
        subtitle: podcast.authorName,
        artworkUrl: podcast.imageUrl || cover(podcast.coverArt),
        playable: false,
        browsable: true,
        childrenStyle: "list",
      }),
    ),
  };
}

async function episodeTracks(
  source: PodcastSource,
  id: string,
  name: string | undefined,
): Promise<QueueTrack[]> {
  if (source === "taddy") {
    const data = (await getPodcastSeries({
      uuid: id,
      limitPerPage: EPISODE_LIMIT,
      sortOrder: "LATEST",
    })) as
      | { getPodcastSeries?: { episodes?: TaddyPodcastEpisode[] } }
      | undefined;
    return (data?.getPodcastSeries?.episodes ?? []).map((episode) =>
      taddyEpisodeToTrack(episode, name),
    );
  }
  const rsp = await getPodcasts({ id, includeEpisodes: true });
  const channel = rsp.podcasts?.channel?.[0];
  return (channel?.episode ?? [])
    .filter(isPlayablePodcastEpisode)
    .slice(0, EPISODE_LIMIT)
    .map((episode) =>
      podcastEpisodeToTrack(episode, name ?? channel?.title, channel),
    );
}

export async function podcastListing(
  source: PodcastSource,
  id: string,
): Promise<Listing> {
  const favorite = usePodcasts
    .getState()
    .favoritePodcasts.find((podcast) => podcast.uuid === id);
  const tracks = await episodeTracks(source, id, favorite?.name);
  const parentId = encodeMediaId({ kind: "podcast", source, id });
  const bucket = podcastPlayedBucket(source, currentAuthScope() ?? undefined);
  const played = usePodcastPlayedBase.getState();
  return {
    nodes: tracks.map(
      (track): BrowseNode => ({
        id: episodeId(parentId, track.id),
        title: track.title ?? "",
        subtitle: track.artist,
        artworkUrl: track.artwork,
        playable: true,
        completion: bucket && played.isPlayed(bucket, track.id) ? 1 : undefined,
      }),
    ),
    tracks,
  };
}
