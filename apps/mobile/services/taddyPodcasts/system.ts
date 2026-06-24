import axios from "axios";
import taddyPodcastsApiInstance, {
  type TaddyPodcastsResponse,
  toTaddyError,
} from "@/services/taddyPodcasts/index";
import type { GetApiRequestsRemaining } from "@/services/taddyPodcasts/types";

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
    throw toTaddyError(error);
  }
};

// Cheap probe to verify a candidate key/user pair before persisting it. Uses a
// raw axios call (not the shared instance) so the request interceptor can't
// override the candidate headers with the currently-stored credentials.
// Invalid credentials come back as HTTP 500 with an errors array; a genuine
// network failure rethrows as-is so the caller can tell the two apart.
export const validateTaddyCredentials = async (
  apiKey: string,
  userId: string,
) => {
  try {
    const rsp = await axios.post<
      TaddyPodcastsResponse<GetApiRequestsRemaining>
    >(
      "https://api.taddy.org",
      { query: `query { getApiRequestsRemaining }` },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
          "X-USER-ID": userId,
        },
      },
    );
    if (Array.isArray(rsp.data?.errors) && rsp.data.errors.length > 0) {
      throw toTaddyError(rsp.data.errors);
    }
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      Array.isArray(error.response?.data?.errors)
    ) {
      throw toTaddyError(error);
    }
    throw error;
  }
};
