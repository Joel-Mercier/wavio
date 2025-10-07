import type { ResponseStatus } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import axios, { Axios } from "axios";
import { use } from "react";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

console.info("NAVIDROME URL : ", useAuthBase.getState().url);
console.info("NAVIDROME USERNAME : ", useAuthBase.getState().username);
console.info("NAVIDROME PASSWORD : ", useAuthBase.getState().password);
console.info("NAVIDROME SUBSONIC API VERSION : ", navidromeSubsonicApiVersion);
console.info("NAVIDROME CLIENT : ", navidromeClient);

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

export type ApiType = typeof openSubsonicApiInstance;

export default openSubsonicApiInstance;
