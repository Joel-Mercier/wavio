import i18n from "@/config/i18n";
import usePodcasts from "@/stores/podcasts";
import axios from "axios";

export type TaddyPodcastsResponse<T> = {
  data: { [key: string]: T };
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
  API_KEY_INVALID: i18n.t("taddyPodcasts.errorCodes.API_KEY_INVALID"),
  API_RATE_LIMIT_EXCEEDED: i18n.t("taddyPodcasts.errorCodes.API_RATE_LIMIT_EXCEEDED"),
  INVALID_QUERY_OR_SYNTAX: i18n.t("taddyPodcasts.errorCodes.INVALID_QUERY_OR_SYNTAX"),
  BAD_USER_INPUT: i18n.t("taddyPodcasts.errorCodes.BAD_USER_INPUT"),
  QUERY_TOO_COMPLEX: i18n.t("taddyPodcasts.errorCodes.QUERY_TOO_COMPLEX"),
  REQUIRES_USER_AUTHENTICATION: i18n.t("taddyPodcasts.errorCodes.REQUIRES_USER_AUTHENTICATION"),
  ACCESS_NOT_ALLOWED: i18n.t("taddyPodcasts.errorCodes.ACCESS_NOT_ALLOWED"),
  TADDY_SERVER_ERROR: i18n.t("taddyPodcasts.errorCodes.TADDY_SERVER_ERROR"),
};

export default taddyPodcastsApiInstance;
