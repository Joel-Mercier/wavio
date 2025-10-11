import usePodcasts from "@/stores/podcasts";
import axios from "axios";

export type TaddyPodcastsResponse<T> = {
  data: T;
};

export type TaddyPodcastsErrorResponse = {
  errors: [
    {
      code: keyof typeof taddyPodcastsErrorCodes;
      message: string;
    },
  ];
  data: Record<string, null>;
};

const taddyPodcastsApiInstance = axios.create({
  baseURL: "https://api.taddy.org",
  headers: { "Content-Type": "application/json" },
});

taddyPodcastsApiInstance.interceptors.request.use(
  (config) => {
    const { taddyPodcastsApiKey, taddyPodcastsUserId } = usePodcasts.getState();
    if (taddyPodcastsApiKey && taddyPodcastsUserId) {
      config.headers["X-API-KEY"] = taddyPodcastsApiKey;
      config.headers["X-USER-ID"] = taddyPodcastsUserId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export const taddyPodcastsErrorCodes: Record<string, string> = {
  API_KEY_INVALID:
    "The API Key or User ID you are using in your headers is invalid.",
  API_RATE_LIMIT_EXCEEDED:
    "You have exceeded your monthly quota of API requests.",
  INVALID_QUERY_OR_SYNTAX:
    "Your query is too complex or there is a spelling or syntax mistake somewhere in your query. Use the message value as a hint as to what can be fixed.",
  BAD_USER_INPUT:
    "One of the arguments you are passing in is invalid. Use the message value to get more details on what is invalid.",
  QUERY_TOO_COMPLEX:
    "The query you are passing in is too complex. Please simplify your query (by removing items from your query)",
  REQUIRES_USER_AUTHENTICATION:
    "You need to be be logged in to make that request.",
  ACCESS_NOT_ALLOWED: "You are not allowed to access this query or mutation.",
  TADDY_SERVER_ERROR:
    "Something is wrong on our end. We have systems in place to monitor this but also feel free to reach out to danny@taddy.org if you are getting this error.",
};

export default taddyPodcastsApiInstance;
