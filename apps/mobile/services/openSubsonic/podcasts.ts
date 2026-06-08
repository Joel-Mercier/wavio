import axios from "axios";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";

export const getPodcasts = async (
  options: { includeEpisodes?: boolean; id?: string } = {},
) => {
  const { includeEpisodes = true, id } = options;
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ podcasts: { channel?: PodcastChannel[] } }>
    >("/rest/getPodcasts", {
      params: {
        includeEpisodes,
        ...(id ? { id } : {}),
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getPodcastEpisode = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ podcastEpisode: PodcastEpisode }>
    >("/rest/getPodcastEpisode", {
      params: { id },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const createPodcastChannel = async (url: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/createPodcastChannel", {
      params: { url },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const deletePodcastChannel = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/deletePodcastChannel", {
      params: { id },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const deletePodcastEpisode = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/deletePodcastEpisode", {
      params: { id },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const downloadPodcastEpisode = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/downloadPodcastEpisode", {
      params: { id },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};
