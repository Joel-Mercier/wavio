import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";

export const getPodcasts = async (
  options: { includeEpisodes?: boolean; id?: string } = {},
) => {
  const { includeEpisodes = true, id } = options;
  return subsonicRequest<{ podcasts: { channel?: PodcastChannel[] } }>(
    "/rest/getPodcasts",
    { includeEpisodes, ...(id ? { id } : {}) },
  );
};

export const getPodcastEpisode = async (id: string) =>
  subsonicRequest<{ podcastEpisode: PodcastEpisode }>(
    "/rest/getPodcastEpisode",
    { id },
  );

export const createPodcastChannel = async (url: string) =>
  subsonicRequest<Record<string, never>>("/rest/createPodcastChannel", { url });

export const deletePodcastChannel = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deletePodcastChannel", { id });

export const deletePodcastEpisode = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deletePodcastEpisode", { id });

export const downloadPodcastEpisode = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/downloadPodcastEpisode", {
    id,
  });
