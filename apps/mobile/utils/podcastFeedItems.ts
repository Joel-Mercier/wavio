import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import type { PodcastEpisode as TaddyPodcastEpisode } from "@/services/taddyPodcasts/types";

// One reverse-chronological feed out of two episode shapes that stay themselves.
// Coercing a Subsonic episode into a Taddy one (or the reverse) would break both
// playback and navigation — the two carry different stream inputs
// (streamId vs audioUrl) and reach different detail routes — so the union keeps
// each episode intact and only lifts what the feed needs: a sort key and a
// collision-free list key.
export type PodcastFeedItem =
  | {
      kind: "taddy";
      key: string;
      publishedAt: number;
      episode: TaddyPodcastEpisode;
    }
  | {
      kind: "server";
      key: string;
      publishedAt: number;
      episode: PodcastEpisode;
      channel: PodcastChannel;
    };

// Taddy dates are unix seconds; a Subsonic episode's publishDate arrives as an
// ISO string over JSON but as a real Date from the local mapper, and a feed need
// not declare one at all. Everything lands in ms, with 0 for unknown so undated
// episodes sort last instead of jumping to the top.
function toMillis(value: Date | string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

const byPublishedAtDesc = (a: PodcastFeedItem, b: PodcastFeedItem) =>
  b.publishedAt === a.publishedAt
    ? a.key.localeCompare(b.key)
    : b.publishedAt - a.publishedAt;

export function buildPodcastFeedItems({
  channels,
  favoriteChannelIds,
  taddyEpisodes,
  taddyHasMore = false,
}: {
  channels: PodcastChannel[];
  favoriteChannelIds: Set<string>;
  taddyEpisodes: TaddyPodcastEpisode[];
  // Whether the Taddy side still has pages to load. A server channel arrives
  // whole while Taddy arrives 25 at a time, so merging everything against a
  // partial Taddy list dumps a channel's entire back catalogue in one block the
  // moment the loaded pages run out — the two sides have to be windowed alike.
  taddyHasMore?: boolean;
}): PodcastFeedItem[] {
  const items: PodcastFeedItem[] = taddyEpisodes.map((episode) => ({
    kind: "taddy",
    key: `taddy:${episode.uuid}`,
    publishedAt: episode.datePublished ? episode.datePublished * 1000 : 0,
    episode,
  }));

  // Hold back server episodes older than the oldest Taddy episode loaded so far.
  // Each new Taddy page lowers the floor and pulls the matching server episodes
  // in with it, so the feed stays interleaved by date at every scroll depth and
  // only ever grows downward. Nothing left to page against — Taddy exhausted (a
  // free plan stops at page 1), or no Taddy subscriptions at all — means no
  // floor: there is nothing further to interleave with, so show the lot.
  const floor =
    taddyHasMore && items.length > 0
      ? Math.min(...items.map((item) => item.publishedAt))
      : Number.NEGATIVE_INFINITY;

  for (const channel of channels) {
    if (!favoriteChannelIds.has(channel.id)) continue;
    for (const episode of channel.episode ?? []) {
      const publishedAt = toMillis(episode.publishDate);
      if (publishedAt < floor) continue;
      items.push({
        kind: "server",
        key: `server:${episode.id}`,
        publishedAt,
        episode,
        channel,
      });
    }
  }

  return items.sort(byPublishedAtDesc);
}
