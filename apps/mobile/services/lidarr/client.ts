import axios, { type AxiosRequestConfig } from "axios";
import { reportError } from "@/services/errorReporting";
import type { LidarrConfig } from "@/services/lidarr/types";
import { useLidarrBase } from "@/stores/lidarr";

// Lidarr is independent of the active music-server backend: its connection is
// configured per (server, user) in stores/lidarr.ts. Config resolves from that
// store by default, but the Test/Connect flow passes an explicit config that
// hasn't been saved yet.
export class LidarrNotConfiguredError extends Error {
  constructor() {
    super("Lidarr is not configured");
    this.name = "LidarrNotConfiguredError";
  }
}

const lidarrApiInstance = axios.create({
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

function resolveConfig(override?: LidarrConfig): LidarrConfig {
  if (override) return override;
  const { serverUrl, apiKey } = useLidarrBase.getState();
  return { serverUrl, apiKey };
}

export type LidarrRequestOptions = Omit<
  AxiosRequestConfig,
  "baseURL" | "headers"
> & {
  /** Override the stored config (used by Test/Connect before saving). */
  config?: LidarrConfig;
  /** Extra headers merged onto the API-key header. */
  headers?: Record<string, string>;
};

export async function lidarrRequest<T>(
  path: string,
  { config, headers, ...axiosConfig }: LidarrRequestOptions = {},
): Promise<T> {
  const { serverUrl, apiKey } = resolveConfig(config);
  if (!serverUrl || !apiKey) {
    throw new LidarrNotConfiguredError();
  }

  const baseURL = `${serverUrl.replace(/\/+$/, "")}/api/v1`;
  try {
    const response = await lidarrApiInstance.request<T>({
      ...axiosConfig,
      url: path,
      baseURL,
      headers: { "X-Api-Key": apiKey, ...headers },
    });
    return response.data;
  } catch (error) {
    reportError(error, { area: "api", api: "lidarr", endpoint: path });
    throw error;
  }
}
