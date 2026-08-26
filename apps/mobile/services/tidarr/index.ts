import axios, { type AxiosRequestConfig } from "axios";
import { reportError } from "@/services/errorReporting";
import type { TidarrConfig } from "@/services/tidarr/types";
import { useTidarrBase } from "@/stores/tidarr";

// Tidarr is independent of the active music-server backend: its connection is
// configured per (server, user) in stores/tidarr.ts. Config resolves from that
// store by default, but the Test/Connect flow passes an explicit config that
// hasn't been saved yet.
export class TidarrNotConfiguredError extends Error {
  constructor() {
    super("Tidarr is not configured");
    this.name = "TidarrNotConfiguredError";
  }
}

const tidarrApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the instance is unreachable (e.g. its LAN IP changed)
  // instead of hanging on the OS TCP timeout.
  timeout: 15000,
});

function resolveConfig(override?: TidarrConfig): TidarrConfig {
  if (override) return override;
  const { serverUrl, apiKey } = useTidarrBase.getState();
  return { serverUrl, apiKey };
}

// Tidarr only enforces auth when ADMIN_PASSWORD or OIDC is configured; with
// neither, it accepts unauthenticated calls and an empty key must not be sent
// as a header, or it would be rejected as a wrong one.
function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { "X-Api-Key": apiKey } : {};
}

function normalizedBase(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}

// Ids in the path would otherwise fingerprint one Issue per record — group
// `/v1/pages/album/93` and `/94` as `/v1/pages/album/:id`.
function endpointFor(path: string): string {
  return path.replace(/\/\d+(?=\/|$)/g, "/:id");
}

export type TidarrRequestOptions = Omit<
  AxiosRequestConfig,
  "baseURL" | "headers"
> & {
  /** Override the stored config (used by Test/Connect before saving). */
  config?: TidarrConfig;
  /** Extra headers merged onto the API-key header. */
  headers?: Record<string, string>;
  /** A 404 is a data state for this call (e.g. the record is already gone). */
  notFoundIsExpected?: boolean;
  /** The call validates user-entered credentials, so a 401/403 is input to fix. */
  unauthorizedIsExpected?: boolean;
};

// Calls Tidarr's own REST API (queue, settings, history).
export async function tidarrRequest<T>(
  path: string,
  {
    config,
    headers,
    notFoundIsExpected,
    unauthorizedIsExpected,
    ...axiosConfig
  }: TidarrRequestOptions = {},
): Promise<T> {
  const { serverUrl, apiKey } = resolveConfig(config);
  if (!serverUrl) {
    throw new TidarrNotConfiguredError();
  }

  try {
    const response = await tidarrApiInstance.request<T>({
      ...axiosConfig,
      url: path,
      baseURL: `${normalizedBase(serverUrl)}/api`,
      headers: { ...authHeaders(apiKey), ...headers },
    });
    return response.data;
  } catch (error) {
    // The classifier drops offline / unreachable / cancelled noise and reports
    // only genuine HTTP failures.
    reportError(error, {
      area: "api",
      api: "tidarr",
      endpoint: endpointFor(path),
      notFoundIsExpected,
      unauthorizedIsExpected,
    });
    throw error;
  }
}

// Calls the Tidal catalog through Tidarr's passthrough proxy, which injects the
// instance's Tidal bearer token and refreshes it on a 401. Tidarr exposes no
// catalog API of its own — this is how its own web UI searches and browses.
export async function tidalProxyRequest<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: Pick<TidarrRequestOptions, "config" | "signal"> = {},
): Promise<T> {
  const { serverUrl, apiKey } = resolveConfig(options.config);
  if (!serverUrl) {
    throw new TidarrNotConfiguredError();
  }

  const { countryCode } = useTidarrBase.getState();
  try {
    const response = await tidarrApiInstance.request<T>({
      url: path,
      baseURL: `${normalizedBase(serverUrl)}/proxy/tidal`,
      signal: options.signal,
      headers: authHeaders(apiKey),
      params: {
        countryCode: countryCode || "US",
        deviceType: "BROWSER",
        locale: "en_US",
        ...params,
      },
    });
    return response.data;
  } catch (error) {
    reportError(error, {
      area: "api",
      api: "tidarr",
      endpoint: `proxy${endpointFor(path)}`,
      // The proxy answers 401 when the instance has no Tidal account linked
      // (surfaced as its own warning on the config screen) and 403 when the API
      // key is wrong. Both are states the user fixes in settings, not bugs.
      unauthorizedIsExpected: true,
    });
    throw error;
  }
}

export default tidarrApiInstance;
