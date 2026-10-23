import axios from "axios";
import { reauthenticateNavidrome } from "@/services/navidrome/auth";
import {
  activeOidcKey,
  ensureFreshAccessToken,
  recoverFromUnauthorized,
} from "@/services/oidc/session";
import {
  authHeadersForUrl,
  customHeadersForUrl,
} from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";
import { logError } from "@/utils/log";
import { USER_AGENT } from "@/utils/userAgent";

export const NAVIDROME_AUTH_HEADER = "X-ND-Authorization";

const navidromeApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

navidromeApiInstance.interceptors.request.use(
  async (request) => {
    await ensureFreshAccessToken();
    const { url, token } = useAuthBase.getState();
    request.baseURL = url ? `${url.replace(/\/+$/, "")}/api` : "";
    // Set before the custom headers so a user-configured User-Agent still wins,
    // matching the other instances. Without it this instance keeps RN's default
    // `okhttp/*`, which Cloudflare-fronted servers reject.
    request.headers.set("User-Agent", USER_AGENT);
    // Navidrome reads its own JWT from `X-ND-Authorization` only, which leaves
    // `Authorization` free for whatever guards the server: a single-sign-on
    // session's bearer token, or a header the user configured for their proxy.
    // Under SSO there may be no JWT at all — Navidrome's external auth accepts
    // the proxy's user header on the native API too.
    const credentials = authHeadersForUrl(url);
    if (credentials) {
      for (const [name, value] of Object.entries(credentials)) {
        request.headers.set(name, value);
      }
    }
    const custom = customHeadersForUrl(url);
    if (custom) {
      for (const [name, value] of Object.entries(custom)) {
        request.headers.set(name, value);
      }
    }
    if (token) {
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
      // Under SSO a 401 is the proxy refusing the access token, not Navidrome
      // refusing a JWT, and there's no password to log in with again. Refresh
      // the token and replay; the native session itself stays.
      if (activeOidcKey()) {
        if (config && !config._retry) {
          config._retry = true;
          if (await recoverFromUnauthorized()) {
            return navidromeApiInstance(config);
          }
        }
        return Promise.reject(error);
      }
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
