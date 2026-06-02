import axios from "axios";
import * as Application from "expo-application";
import type { RadioBrowserServer } from "@/services/radioBrowser/types";

// Radio-Browser has no single fixed host; it's a pool of mirrors. The
// recommended flow is to fetch the current mirror list once and pick one at
// random, falling back to a known-good mirror if discovery fails.
const FALLBACK_BASE_URL = "https://de2.api.radio-browser.info";
const SERVERS_URL = "https://all.api.radio-browser.info/json/servers";

const USER_AGENT = `Wavio/${Application.nativeApplicationVersion ?? "1.0.0"}`;

let baseUrlPromise: Promise<string> | null = null;

const resolveBaseUrl = (): Promise<string> => {
  if (!baseUrlPromise) {
    baseUrlPromise = axios
      .get<RadioBrowserServer[]>(SERVERS_URL, {
        timeout: 5000,
        headers: { "User-Agent": USER_AGENT },
      })
      .then((rsp) => {
        const servers = rsp.data ?? [];
        if (servers.length === 0) {
          return FALLBACK_BASE_URL;
        }
        const server = servers[Math.floor(Math.random() * servers.length)];
        return `https://${server.name}`;
      })
      .catch(() => {
        // Reset so a later call can retry discovery.
        baseUrlPromise = null;
        return FALLBACK_BASE_URL;
      });
  }
  return baseUrlPromise;
};

const radioBrowserApiInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  },
});

radioBrowserApiInstance.interceptors.request.use(async (config) => {
  if (!config.baseURL) {
    config.baseURL = await resolveBaseUrl();
  }
  return config;
});

export default radioBrowserApiInstance;
