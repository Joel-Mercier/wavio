import type { ResponseStatus } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import axios from "axios";

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
  // baseURL is set dynamically in the interceptor from the latest auth store state
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

openSubsonicApiInstance.interceptors.request.use(
  (request) => {
    const { url, username, password } = useAuthBase.getState();
    // Ensure params is always an object before assigning
    console.log("INTERCEPTOR", request.baseURL, url, username, password);
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

export type ApiType = typeof openSubsonicApiInstance;

export default openSubsonicApiInstance;
