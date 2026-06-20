import { reportError } from "@/services/errorReporting";
import type { PodcastEpisodeRow } from "@/services/local/db";
import {
  localPodcastEpisodeId,
  newLocalPodcastChannelId,
} from "@/services/local/keys";
import { mapChannelRow, mapEpisodeRow } from "@/services/local/mappers";
import {
  deletePodcastChannel as deletePodcastChannelRow,
  deletePodcastEpisode as deletePodcastEpisodeRow,
  insertPodcastChannel,
  queryPodcastChannelById,
  queryPodcastChannelByUrl,
  queryPodcastChannels,
  queryPodcastEpisodeById,
  queryPodcastEpisodesByChannel,
  queryPodcastEpisodesByChannelIds,
  updatePodcastChannelMeta,
  updatePodcastChannelStatus,
  upsertPodcastEpisodes,
} from "@/services/local/repository";
import {
  LocalUnsupportedError,
  localEnvelope,
} from "@/services/local/unsupported";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import { fetchAndParseFeed, type ParsedFeed } from "@/services/podcastFeed";

// On-device podcasts, backed by the per-(server,user) SQLite database (see db.ts)
// and the backend-agnostic RSS parser (services/podcastFeed.ts). Mirrors
// services/openSubsonic/podcasts.ts so the dispatch layer, hooks and UI consume
// identical shapes. The OpenSubsonic flow has the *server* fetch and parse the
// feed from a single URL; with a local library there's no server, so we fetch +
// parse on-device at create time and re-parse (refresh) whenever a channel is
// opened. Episodes stream straight from their enclosure URL.

const CONTENT_TYPE_SUFFIX: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "video/mp4": "mp4",
};

function suffixFor(url: string, contentType?: string): string {
  if (contentType) {
    const mapped = CONTENT_TYPE_SUFFIX[contentType.toLowerCase()];
    if (mapped) return mapped;
  }
  const match = url.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{1,5})$/);
  return match ? match[1].toLowerCase() : "mp3";
}

function buildEpisodeRows(
  channelId: string,
  feed: ParsedFeed,
  now: number,
): PodcastEpisodeRow[] {
  return feed.items.map((item) => ({
    id: localPodcastEpisodeId(item.enclosureUrl),
    channel_id: channelId,
    guid: item.guid,
    title: item.title ?? null,
    description: item.description ?? null,
    publish_date: item.publishedAt ?? null,
    duration: item.durationSeconds ?? null,
    suffix: suffixFor(item.enclosureUrl, item.enclosureType),
    content_type: item.enclosureType ?? null,
    size: item.enclosureLength ?? null,
    stream_url: item.enclosureUrl,
    original_image_url: item.imageUrl ?? feed.imageUrl ?? null,
    created_at: now,
  }));
}

/**
 * Fetch + parse a channel's feed and persist channel metadata + episodes. On
 * success the channel is marked "completed"; on failure it's marked "error" with
 * the message (matching Subsonic semantics) and the error is rethrown so callers
 * that want to surface it (create) can, while refresh callers can swallow it.
 */
async function refreshChannel(
  channelId: string,
  url: string,
  now: number,
): Promise<void> {
  try {
    const feed = await fetchAndParseFeed(url);
    await updatePodcastChannelMeta(channelId, {
      title: feed.title ?? null,
      description: feed.description ?? null,
      author: feed.author ?? null,
      original_image_url: feed.imageUrl ?? null,
      status: "completed",
      error_message: null,
      updated_at: now,
    });
    await upsertPodcastEpisodes(buildEpisodeRows(channelId, feed, now));
  } catch (error) {
    // Keep the previously stored metadata/episodes: a transient failure (e.g.
    // opening the channel offline) must not blank out the cached channel.
    await updatePodcastChannelStatus(channelId, {
      status: "error",
      error_message: error instanceof Error ? error.message : "Unknown error",
      updated_at: now,
    });
    throw error;
  }
}

async function channelWithEpisodes(
  channelId: string,
  includeEpisodes: boolean,
): Promise<PodcastChannel | null> {
  const row = await queryPodcastChannelById(channelId);
  if (!row) return null;
  const episodes = includeEpisodes
    ? (await queryPodcastEpisodesByChannel(channelId)).map(mapEpisodeRow)
    : undefined;
  return mapChannelRow(row, episodes);
}

// Skip the feed re-parse when the channel was successfully refreshed recently,
// so reopening a channel doesn't block the JS thread re-parsing a large feed.
const REFRESH_TTL_MS = 15 * 60 * 1000;

export const getPodcasts = async (
  options: { includeEpisodes?: boolean; id?: string } = {},
) => {
  const { includeEpisodes = true, id } = options;

  // A specific channel (the detail screen): re-parse its feed first so opening a
  // channel surfaces new episodes, then fall back to cached rows if offline.
  if (id) {
    const row = await queryPodcastChannelById(id);
    if (!row) return localEnvelope({ podcasts: { channel: [] } });
    const now = Date.now();
    const fresh =
      row.status === "completed" && now - row.updated_at < REFRESH_TTL_MS;
    if (!fresh) {
      try {
        await refreshChannel(id, row.url, now);
      } catch (error) {
        reportError(error, {
          area: "local-library",
          backend: "local",
          endpoint: "podcasts/refresh",
        });
      }
    }
    const channel = await channelWithEpisodes(id, includeEpisodes);
    return localEnvelope({ podcasts: { channel: channel ? [channel] : [] } });
  }

  // The full list: read stored channels without hitting the network.
  const rows = await queryPodcastChannels();
  if (!includeEpisodes) {
    return localEnvelope({
      podcasts: { channel: rows.map((row) => mapChannelRow(row)) },
    });
  }
  const episodeRows = await queryPodcastEpisodesByChannelIds(
    rows.map((row) => row.id),
  );
  const episodesByChannel = new Map<string, PodcastEpisode[]>();
  for (const episode of episodeRows) {
    let list = episodesByChannel.get(episode.channel_id);
    if (!list) {
      list = [];
      episodesByChannel.set(episode.channel_id, list);
    }
    list.push(mapEpisodeRow(episode));
  }
  const channels = rows.map((row) =>
    mapChannelRow(row, episodesByChannel.get(row.id) ?? []),
  );
  return localEnvelope({ podcasts: { channel: channels } });
};

export const getPodcastEpisode = async (id: string) => {
  const row = await queryPodcastEpisodeById(id);
  if (!row)
    throw new LocalUnsupportedError(`podcast episode "${id}" (not found)`);
  const episode: PodcastEpisode = mapEpisodeRow(row);
  return localEnvelope({ podcastEpisode: episode });
};

export const createPodcastChannel = async (url: string) => {
  const now = Date.now();
  // Re-adding an existing feed refreshes it in place rather than failing on the
  // url UNIQUE constraint or creating a duplicate channel. A failed refresh here
  // keeps the previously cached metadata/episodes, so a transient blip doesn't
  // blank out a working channel — we swallow it and report.
  const existing = await queryPodcastChannelByUrl(url);
  if (existing) {
    await refreshChannel(existing.id, url, now).catch((error) => {
      reportError(error, {
        area: "local-library",
        backend: "local",
        endpoint: "podcasts/create",
      });
    });
    return localEnvelope({});
  }

  // A brand-new feed: unlike server-hosted Subsonic podcasts (where the server
  // validates the URL asynchronously), we fetch + parse on-device right here, so
  // we can reject an invalid/unreachable feed up front. Roll back the row and
  // rethrow so the caller shows an error toast instead of leaving an empty,
  // title-less channel in the list.
  const channelId = newLocalPodcastChannelId();
  await insertPodcastChannel({
    id: channelId,
    url,
    title: null,
    description: null,
    author: null,
    original_image_url: null,
    status: "new",
    error_message: null,
    created_at: now,
    updated_at: now,
  });
  try {
    await refreshChannel(channelId, url, now);
  } catch (error) {
    await deletePodcastChannelRow(channelId);
    throw error;
  }
  return localEnvelope({});
};

export const deletePodcastChannel = async (id: string) => {
  await deletePodcastChannelRow(id);
  return localEnvelope({});
};

export const deletePodcastEpisode = async (id: string) => {
  await deletePodcastEpisodeRow(id);
  return localEnvelope({});
};

// Local episodes are already streamable from their enclosure URL — there's no
// server-side download lifecycle to kick off. (The optional *on-device* offline
// download is a separate UI affordance via the shared offline pipeline.)
export const downloadPodcastEpisode = async (_id: string) => localEnvelope({});
