import axios, { type AxiosRequestConfig } from "axios";
import type { AudioMuseConfig } from "@/services/audioMuse/types";
import { reportError } from "@/services/errorReporting";
import { useAudioMuseBase } from "@/stores/audioMuse";

// AudioMuse-AI is a side-car that analyses the same library the active music
// server serves, but it is reached directly rather than through that server:
// only a subset of its features is exposed by the Navidrome/Jellyfin plugins
// (see services/similarSongs.ts for the plugin path, which this does not
// replace). Its connection is configured per (server, user) in
// stores/audioMuse.ts. Config resolves from that store by default, but the
// Test/Connect flow passes an explicit config that hasn't been saved yet.
export class AudioMuseNotConfiguredError extends Error {
  constructor() {
    super("AudioMuse-AI is not configured");
    this.name = "AudioMuseNotConfiguredError";
  }
}

const audioMuseApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the instance is unreachable (e.g. its LAN IP changed)
  // instead of hanging on the OS TCP timeout. Generators that run an LLM or a
  // full index query pass their own, longer timeout.
  timeout: 15000,
});

function resolveConfig(override?: AudioMuseConfig): AudioMuseConfig {
  if (override) return override;
  const { serverUrl, apiToken } = useAudioMuseBase.getState();
  return { serverUrl, apiToken };
}

export type AudioMuseRequestOptions = Omit<
  AxiosRequestConfig,
  "baseURL" | "headers"
> & {
  /** Override the stored config (used by Test/Connect before saving). */
  config?: AudioMuseConfig;
  /** Extra headers merged onto the authorization header. */
  headers?: Record<string, string>;
  /**
   * Skip the media-server selection. Only for deployment-wide endpoints
   * (/api/health, /api/servers), which have no server scope.
   */
  skipServerScope?: boolean;
  /** The call is validating a user-entered token, so a 401 is not a bug. */
  unauthorizedIsExpected?: boolean;
  /** A 404 is a data/capability state here, not a bug. */
  notFoundIsExpected?: boolean;
  /** A 503 is a deployment state here (an index not built yet), not a bug. */
  serviceUnavailableIsExpected?: boolean;
};

// Shared request wrapper for the section files: resolves the connection config,
// scopes the call to the selected media server and unwraps the response body.
export async function audioMuseRequest<T>(
  path: string,
  {
    config,
    headers,
    skipServerScope,
    unauthorizedIsExpected,
    notFoundIsExpected,
    serviceUnavailableIsExpected,
    ...axiosConfig
  }: AudioMuseRequestOptions = {},
): Promise<T> {
  const { serverUrl, apiToken } = resolveConfig(config);
  if (!serverUrl) {
    throw new AudioMuseNotConfiguredError();
  }

  const baseURL = serverUrl.replace(/\/+$/, "");
  // A deployment running with AUTH_ENABLED=false rejects nothing but also
  // issues no token, so an empty token must not become `Bearer `.
  const authHeader = apiToken
    ? { Authorization: `Bearer ${apiToken}` }
    : undefined;

  try {
    const response = await audioMuseApiInstance.request<T>({
      ...axiosConfig,
      ...(skipServerScope ? {} : withServerScope(axiosConfig)),
      url: path,
      baseURL,
      headers: { ...authHeader, ...headers },
    });
    return response.data;
  } catch (error) {
    // AudioMuse says *why* it refused in the body ("CLAP text search is
    // disabled", "Unknown server 'x'", …). Fold that onto the error message so
    // the reason reaches the console, Sentry and ErrorDisplay instead of a bare
    // "Request failed with status code 400".
    const serverMessage = audioMuseErrorMessage(error);
    if (serverMessage && error instanceof Error) {
      error.message = `${error.message}: ${serverMessage}`;
    }
    // The classifier drops offline / unreachable / cancelled noise and reports
    // only genuine HTTP failures.
    reportError(error, {
      area: "api",
      api: "audiomuse",
      endpoint: path,
      unauthorizedIsExpected,
      notFoundIsExpected,
      serviceUnavailableIsExpected,
      extra: serverMessage ? { serverMessage } : undefined,
    });
    throw error;
  }
}

/** The `error` string AudioMuse puts in a 4xx body, when there is one. */
export function audioMuseErrorMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { error?: unknown } | undefined;
  return typeof data?.error === "string" && data.error ? data.error : null;
}

// One AudioMuse deployment can analyse several media servers, and it translates
// every item_id it returns into the selected server's own provider ids. Getting
// this wrong doesn't error — it silently returns ids from another library — so
// the selection rides on every scoped call. GETs carry it as a query param,
// bodied requests as a field, matching app_server_context.resolve_request_server_id.
function withServerScope(
  axiosConfig: Omit<AxiosRequestConfig, "baseURL" | "headers">,
): Partial<AxiosRequestConfig> {
  const { serverId } = useAudioMuseBase.getState();
  if (!serverId) return {};

  const method = (axiosConfig.method ?? "get").toString().toLowerCase();
  if (method === "get") {
    return { params: { ...axiosConfig.params, server: serverId } };
  }
  return {
    data: {
      ...(axiosConfig.data as Record<string, unknown>),
      server: serverId,
    },
  };
}

export default audioMuseApiInstance;
