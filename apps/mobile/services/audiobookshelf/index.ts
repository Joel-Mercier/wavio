import axios, { type AxiosRequestConfig } from "axios";
import type {
  AbsConfig,
  AbsLoginResponse,
} from "@/services/audiobookshelf/types";
import { reportError } from "@/services/errorReporting";
import { setIntegrationBearer } from "@/services/serverHeaders";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";
import { USER_AGENT } from "@/utils/userAgent";

export class AudiobookshelfNotConfiguredError extends Error {
  constructor() {
    super("Audiobookshelf is not configured");
    this.name = "AudiobookshelfNotConfiguredError";
  }
}

export class AudiobookshelfSessionExpiredError extends Error {
  constructor() {
    super("Audiobookshelf session expired");
    this.name = "AudiobookshelfSessionExpiredError";
  }
}

const absApiInstance = axios.create({
  headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
  timeout: 15000,
});

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function storedConfig(): AbsConfig {
  const { serverUrl, accessToken, refreshToken } =
    useAudiobookshelfBase.getState();
  return { serverUrl, accessToken, refreshToken };
}

function publishBearer() {
  const { serverUrl, accessToken, isConnected } =
    useAudiobookshelfBase.getState();
  setIntegrationBearer(
    "audiobookshelf",
    isConnected && serverUrl && accessToken
      ? { baseUrl: serverUrl, accessToken }
      : null,
  );
}

publishBearer();
useAudiobookshelfBase.subscribe(publishBearer);

let refreshInFlight: Promise<string> | null = null;

// The refresh token rotates on every use, so two requests that 401 together
// must share one refresh: the second would otherwise present a token the first
// already spent and sign the user out.
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    const { serverUrl, refreshToken } = storedConfig();
    if (!serverUrl || !refreshToken) {
      throw new AudiobookshelfSessionExpiredError();
    }
    try {
      const { data } = await absApiInstance.post<AbsLoginResponse>(
        `${serverUrl}/auth/refresh`,
        null,
        { headers: { "x-refresh-token": refreshToken } },
      );
      const accessToken = data.user.accessToken;
      if (!accessToken) throw new AudiobookshelfSessionExpiredError();
      useAudiobookshelfBase.getState().setTokens({
        accessToken,
        refreshToken: data.user.refreshToken ?? refreshToken,
      });
      return accessToken;
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (
        error instanceof AudiobookshelfSessionExpiredError ||
        status === 401 ||
        status === 403
      ) {
        useAudiobookshelfBase.getState().setConnected(false);
        throw new AudiobookshelfSessionExpiredError();
      }
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export type AbsRequestOptions = Omit<AxiosRequestConfig, "baseURL"> & {
  /** Override the stored config (sign-in, before anything is saved). */
  config?: Pick<AbsConfig, "serverUrl"> & Partial<AbsConfig>;
  unauthorizedIsExpected?: boolean;
  notFoundIsExpected?: boolean;
};

export async function absRequest<T>(
  path: string,
  {
    config,
    headers,
    unauthorizedIsExpected,
    notFoundIsExpected,
    ...axiosConfig
  }: AbsRequestOptions = {},
): Promise<T> {
  const resolved = config ?? storedConfig();
  if (!resolved.serverUrl) throw new AudiobookshelfNotConfiguredError();
  const baseURL = resolved.serverUrl;

  const send = (accessToken: string | undefined) =>
    absApiInstance.request<T>({
      ...axiosConfig,
      url: path,
      baseURL,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    });

  try {
    try {
      return (await send(resolved.accessToken)).data;
    } catch (error) {
      const canRefresh =
        !config &&
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        !!resolved.refreshToken;
      if (!canRefresh) throw error;
      return (await send(await refreshAccessToken())).data;
    }
  } catch (error) {
    if (!(error instanceof AudiobookshelfSessionExpiredError)) {
      reportError(error, {
        area: "api",
        api: "audiobookshelf",
        endpoint: path,
        unauthorizedIsExpected,
        notFoundIsExpected,
      });
    }
    throw error;
  }
}

/** The configured server, or "" when none. URLs below are built on it. */
export function absServerUrl(): string {
  return useAudiobookshelfBase.getState().serverUrl;
}

export default absApiInstance;
