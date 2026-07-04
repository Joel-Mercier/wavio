import axios from "axios";
import { reauthenticateNavidrome } from "@/services/navidrome/auth";
import { useAuthBase } from "@/stores/auth";
import { logError } from "@/utils/log";

export const NAVIDROME_AUTH_HEADER = "X-ND-Authorization";

const navidromeApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

navidromeApiInstance.interceptors.request.use(
  (request) => {
    const { url, token } = useAuthBase.getState();
    request.baseURL = url ? `${url.replace(/\/+$/, "")}/api` : "";
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
      request.headers.set(NAVIDROME_AUTH_HEADER, `Bearer ${token}`);
    }
    return request;
  },
  (error) => {
    logError(error);
    return Promise.reject(error);
  },
);

navidromeApiInstance.interceptors.response.use(
  (response) => {
    const refreshed =
      (response.headers?.[NAVIDROME_AUTH_HEADER.toLowerCase()] as
        | string
        | undefined) ??
      (response.headers?.[NAVIDROME_AUTH_HEADER] as string | undefined);
    if (refreshed && typeof refreshed === "string" && refreshed.length > 0) {
      const next = refreshed.startsWith("Bearer ")
        ? refreshed.slice(7)
        : refreshed;
      const current = useAuthBase.getState().token;
      if (next && next !== current) {
        useAuthBase.getState().setToken(next);
      }
    }
    return response;
  },
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const config = error.config as
        | (typeof error.config & { _retry?: boolean })
        | undefined;
      // A 401 means the native JWT is missing or expired. Re-acquire it once
      // from the stored credentials and replay the request; the request
      // interceptor picks up the refreshed token from the store. `_retry` guards
      // against looping if the fresh token is also rejected.
      if (config && !config._retry) {
        config._retry = true;
        const token = await reauthenticateNavidrome();
        if (token) {
          return navidromeApiInstance(config);
        }
      }
      // Couldn't re-auth (no credentials, or /auth/login rejected) — drop the
      // stale native session so callers stop relying on it.
      useAuthBase.getState().setNavidromeSession(null);
    }
    return Promise.reject(error);
  },
);

export default navidromeApiInstance;
