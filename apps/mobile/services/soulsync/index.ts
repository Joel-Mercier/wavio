import axios, { type AxiosRequestConfig } from "axios";
import i18n from "@/config/i18n";
import { reportError } from "@/services/errorReporting";
import type {
  SoulSyncConfig,
  SoulSyncEnvelope,
  SoulSyncPagination,
} from "@/services/soulsync/types";
import { useSoulSyncBase } from "@/stores/soulsync";

// SoulSync is independent of the active music-server backend: its connection is
// configured per (server, user) in stores/soulsync.ts. Config resolves from that
// store by default, but the Test/Connect flow passes an explicit config that
// hasn't been saved yet.
export class SoulSyncNotConfiguredError extends Error {
  constructor() {
    super("SoulSync is not configured");
    this.name = "SoulSyncNotConfiguredError";
  }
}

// A well-formed failure envelope (`success: false`). Carries the machine code so
// callers can branch on it, and a message already resolved to the user's locale.
export class SoulSyncApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SoulSyncApiError";
    this.code = code;
  }
}

// Codes we translate; anything else falls back to the server's own message,
// which is English but more specific than a generic string.
const TRANSLATED_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "INVALID_KEY",
  "RATE_LIMITED",
  "NOT_AVAILABLE",
  "NOT_FOUND",
  "CONFLICT",
  "BAD_REQUEST",
  "INTERNAL_ERROR",
]);

function translateErrorCode(code: string, fallback: string): string {
  if (!TRANSLATED_ERROR_CODES.has(code)) return fallback;
  return i18n.t(`soulSync.errorCodes.${code}`, { defaultValue: fallback });
}

const soulSyncApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the instance is unreachable (e.g. its LAN IP changed)
  // instead of hanging on the OS TCP timeout.
  timeout: 15000,
});

function resolveConfig(override?: SoulSyncConfig): SoulSyncConfig {
  if (override) return override;
  const { serverUrl, apiKey, profileId } = useSoulSyncBase.getState();
  return { serverUrl, apiKey, profileId };
}

export type SoulSyncRequestOptions = Omit<
  AxiosRequestConfig,
  "baseURL" | "headers"
> & {
  /** Override the stored config (used by Test/Connect before saving). */
  config?: SoulSyncConfig;
  /** Extra headers merged onto the auth headers. */
  headers?: Record<string, string>;
};

export interface SoulSyncPagedResult<T> {
  data: T;
  pagination: SoulSyncPagination | null;
}

// Shared request wrapper: resolves the connection config, scopes the call to
// the /api/v1 root and unwraps the `{success, data, error}` envelope every
// endpoint returns, so callers only ever see the payload.
export async function soulSyncRequest<T>(
  path: string,
  options: SoulSyncRequestOptions = {},
): Promise<T> {
  const { data } = await soulSyncRequestPaged<T>(path, options);
  return data;
}

// Same as soulSyncRequest but keeps the envelope's pagination block, for the
// list endpoints that page.
export async function soulSyncRequestPaged<T>(
  path: string,
  { config, headers, ...axiosConfig }: SoulSyncRequestOptions = {},
): Promise<SoulSyncPagedResult<T>> {
  const { serverUrl, apiKey, profileId } = resolveConfig(config);
  if (!serverUrl || !apiKey) {
    throw new SoulSyncNotConfiguredError();
  }

  const baseURL = `${serverUrl.replace(/\/+$/, "")}/api/v1`;
  let body: SoulSyncEnvelope<T> | undefined;
  try {
    const response = await soulSyncApiInstance.request<SoulSyncEnvelope<T>>({
      ...axiosConfig,
      url: path,
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Profile-Id": String(profileId ?? 1),
        ...headers,
      },
    });
    body = response.data;
  } catch (error) {
    // The classifier drops offline / unreachable / cancelled noise and reports
    // only genuine HTTP failures.
    reportError(error, { area: "api", api: "soulsync", endpoint: path });
    // A failure envelope arriving with a non-2xx status is still a structured
    // error; re-throw it in the same shape as the 2xx path below so callers
    // have one error type to handle.
    if (axios.isAxiosError(error)) {
      const errorBody = error.response?.data as SoulSyncEnvelope<T> | undefined;
      if (errorBody?.error?.code) {
        throw new SoulSyncApiError(
          errorBody.error.code,
          translateErrorCode(errorBody.error.code, errorBody.error.message),
        );
      }
    }
    throw error;
  }

  // A 2xx with `success: false` is still a failure — the API answers 200 for
  // some soft outcomes, so the envelope, not the HTTP status, is the source of
  // truth.
  if (!body?.success) {
    const code = body?.error?.code ?? "INTERNAL_ERROR";
    throw new SoulSyncApiError(
      code,
      translateErrorCode(code, body?.error?.message ?? "Request failed"),
    );
  }
  return { data: body.data as T, pagination: body.pagination };
}

export default soulSyncApiInstance;
