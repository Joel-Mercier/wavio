import axios from "axios";
import { reportError } from "@/services/errorReporting";
import { getDeviceId } from "@/services/jellyfin/deviceId";
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
    request.headers.set(
      "X-Emby-Authorization",
      buildAuthorizationHeader(jellyfinAccessToken),
    );
    if (jellyfinAccessToken) {
      request.headers.set("X-Emby-Token", jellyfinAccessToken);
    }
    return request;
  },
  (error) => Promise.reject(error),
);

jellyfinApiInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Token rejected — drop the Jellyfin session so the user falls back
      // to the login screen. Do not log out from offline-mode-induced errors.
      useAuthBase.getState().setJellyfinSession(null);
      useAuthBase.getState().logout();
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
