import taddyPodcastsApiInstance, {
  type TaddyPodcastsResponse,
} from "@/services/taddyPodcasts/index";
import type { GetApiRequestsRemaining } from "@/services/taddyPodcasts/types";
import axios from "axios";

export const getApiRequestsRemaining = async () => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<GetApiRequestsRemaining>
    >("", {
      query: `query {
        getApiRequestsRemaining
      }`,
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};
