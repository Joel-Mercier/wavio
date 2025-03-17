import axios from "axios";
import type { ResponseStatus } from "./types";

const navidromeUrl = process.env.EXPO_PUBLIC_NAVIDROME_URL || "";
const navidromeUsername = process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || "";
const navidromePassword = process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD || "";
const navidromeSubsonicApiVersion = process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

console.log("NAVIDROME URL : ", navidromeUrl);
console.log("NAVIDROME USERNAME : ", navidromeUsername);
console.log("NAVIDROME PASSWORD : ", navidromePassword);
console.log("NAVIDROME SUBSONIC API VERSION : ", navidromeSubsonicApiVersion);
console.log("NAVIDROME CLIENT : ", navidromeClient);


export type OpenSubsonicResponse<T> = {
  "subsonic-response": {
    status: ResponseStatus;
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: OpenSubsonicErrorResponse
  } & T
}

export type OpenSubsonicErrorResponse = {
  code: number;
  message?: string;
  helpUrl?: string;
}

const openSubsonicApiInstance = axios.create({
  baseURL: navidromeUrl,
  headers: { "Content-Type": "application/json" },
});

openSubsonicApiInstance.interceptors.request.use((request) => {
  request.params.u = navidromeUsername;
  request.params.p = navidromePassword;
  request.params.v = navidromeSubsonicApiVersion;
  request.params.c = navidromeClient;
  request.params.f = "json";
  return request;
},
  (error) => {
    console.error(error)
    Promise.reject(error)
  });

export type ApiType = typeof openSubsonicApiInstance;

export default openSubsonicApiInstance;
