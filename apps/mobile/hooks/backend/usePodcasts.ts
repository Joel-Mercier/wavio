import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createPodcastChannel,
  deletePodcastChannel,
  deletePodcastEpisode,
  getPodcastEpisode,
  getPodcasts,
} from "@/services/backend/podcasts";

export const useGetPodcasts = (options?: {
  id?: string;
  includeEpisodes?: boolean;
  enabled?: boolean;
}) => {
  const { id, includeEpisodes = true, enabled } = options ?? {};
  return useQuery({
    queryKey: ["podcasts", id ?? null, includeEpisodes],
    queryFn: () => getPodcasts({ id, includeEpisodes }),
    enabled,
  });
};

export const useGetPodcastEpisode = (options: {
  id?: string;
  enabled?: boolean;
}) => {
  const { id, enabled } = options;
  return useQuery({
    queryKey: ["podcast_episode", id],
    queryFn: () => getPodcastEpisode(id as string),
    enabled: enabled !== undefined ? enabled : !!id,
  });
};

export const useCreatePodcastChannel = () => {
  return useMutation({
    mutationFn: (params: { url: string }) => createPodcastChannel(params.url),
  });
};

export const useDeletePodcastChannel = () => {
  return useMutation({
    mutationFn: (params: { id: string }) => deletePodcastChannel(params.id),
  });
};

export const useDeletePodcastEpisode = () => {
  return useMutation({
    mutationFn: (params: { id: string }) => deletePodcastEpisode(params.id),
  });
};
