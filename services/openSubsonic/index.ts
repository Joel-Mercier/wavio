import i18n from "@/config/i18n";
import type { ResponseStatus } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import axios from "axios";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

console.log("[app] Navidrome Subsonic API Version : ", navidromeSubsonicApiVersion);
console.log("[app] Navidrome Client : ", navidromeClient);

export type OpenSubsonicResponse<T> = {
  "subsonic-response": {
    status: ResponseStatus;
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: OpenSubsonicErrorResponse;
  } & T;
};

export type OpenSubsonicErrorResponse = {
  code: number;
  message?: string;
  helpUrl?: string;
};

const openSubsonicApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

openSubsonicApiInstance.interceptors.request.use(
  (request) => {
    const { url, username, password } = useAuthBase.getState();
    request.params = {
      ...(request.params ?? {}),
      u: username,
      p: password,
      v: navidromeSubsonicApiVersion,
      c: navidromeClient,
      f: "json",
    };
    request.baseURL = url || request.baseURL || "";
    return request;
  },
  (error) => {
    console.error(error);
    return Promise.reject(error);
  },
);

openSubsonicApiInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error(error);
    if (axios.isAxiosError(error)) {
      if (error.code === "ERR_NETWORK") {
        useAuthBase.getState().logout();
      }
    }
    return Promise.reject(error);
  },
);

export const openSubsonicErrorCodes: Record<number, string> = {
  10: i18n.t("openSubsonic.errorCodes.10"),
  20: i18n.t("openSubsonic.errorCodes.20"),
  30: i18n.t("openSubsonic.errorCodes.30"),
  40: i18n.t("openSubsonic.errorCodes.40"),
  41: i18n.t("openSubsonic.errorCodes.41"),
  42: i18n.t("openSubsonic.errorCodes.42"),
  43: i18n.t("openSubsonic.errorCodes.43"),
  44: i18n.t("openSubsonic.errorCodes.44"),
  50: i18n.t("openSubsonic.errorCodes.50"),
  60: i18n.t("openSubsonic.errorCodes.60"),
  70: i18n.t("openSubsonic.errorCodes.70"),
};

export type ApiType = typeof openSubsonicApiInstance;

export default openSubsonicApiInstance;
