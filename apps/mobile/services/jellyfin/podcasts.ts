import { fakeEnvelope } from "@/services/jellyfin/unsupported";

// Jellyfin has no Subsonic-style podcast section. UI capability gates
// (capabilities.podcasts) hide these flows when the active server is Jellyfin,
// so these stubs just return empty success envelopes.

export const getPodcasts = async (
  _options: { includeEpisodes?: boolean; id?: string } = {},
) => fakeEnvelope({ podcasts: { channel: [] } });

export const getPodcastEpisode = async (_id: string) =>
  fakeEnvelope({ podcastEpisode: undefined });

export const createPodcastChannel = async (_url: string) => fakeEnvelope({});

export const deletePodcastChannel = async (_id: string) => fakeEnvelope({});

export const deletePodcastEpisode = async (_id: string) => fakeEnvelope({});

export const downloadPodcastEpisode = async (_id: string) => fakeEnvelope({});
