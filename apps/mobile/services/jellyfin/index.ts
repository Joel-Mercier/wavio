import axios from "axios";
import { reportError } from "@/services/errorReporting";
import { getDeviceId } from "@/services/jellyfin/deviceId";
import { USER_AGENT } from "@/services/network";
import { customHeadersForUrl } from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";

const client = process.env.EXPO_PUBLIC_CLIENT_NAME || "Wavio";

export function buildAuthorizationHeader(token?: string | null): string {
  const deviceId = getDeviceId();
  const parts = [
    `Client="${client}"`,
    `Device="${client}"`,
    `DeviceId="${deviceId}"`,
    `Version="1.0.0"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(", ")}`;
}

const jellyfinApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the server is unreachable instead of hanging on the OS TCP
  // timeout. The reachability probe enforces its own shorter deadline on top.
  timeout: 15000,
});

jellyfinApiInstance.interceptors.request.use(
  (request) => {
    const { url, jellyfinAccessToken } = useAuthBase.getState();
    request.baseURL = url ? url.replace(/\/+$/, "") : "";
    request.headers.set("User-Agent", USER_AGENT);
    request.headers.set(
      "Authorization",
      buildAuthorizationHeader(jellyfinAccessToken),
    );
    // Applied last so a user-configured value wins on a name collision — see
    // services/serverHeaders.ts. `Authorization` is the exception: it now
    // carries the Jellyfin session, so letting a custom value win would
    // deauthenticate every request.
    const custom = customHeadersForUrl(request.baseURL);
    if (custom) {
      for (const [name, value] of Object.entries(custom)) {
        if (name.toLowerCase() === "authorization") continue;
        request.headers.set(name, value);
      }
    }
    return request;
  },
  (error) => Promise.reject(error),
);

jellyfinApiInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    // A child browse (album/artist/directory contents) can carry this flag: a
    // 400/404 there means a stale/invalid item id, which the caller resolves to
    // an empty result — a data state, not a bug, so don't report it.
    const notFoundIsExpected = (
      error?.config as { notFoundIsExpected?: boolean } | undefined
    )?.notFoundIsExpected;
    if (status === 401) {
      // Token rejected — drop the Jellyfin session so the user falls back
      // to the login screen. Do not log out from offline-mode-induced errors.
      useAuthBase.getState().setJellyfinSession(null);
      useAuthBase.getState().logout();
    } else if (notFoundIsExpected && (status === 400 || status === 404)) {
      // Expected stale-id not-found on a child browse; handled by the caller.
    } else {
      // The classifier drops offline / unreachable / cancelled noise; a genuine
      // 4xx/5xx (other than the 401 handled above) is a real failing endpoint.
      reportError(error, {
        area: "api",
        backend: "jellyfin",
        endpoint: axios.isAxiosError(error) ? error.config?.url : undefined,
      });
    }
    return Promise.reject(error);
  },
);

export default jellyfinApiInstance;
