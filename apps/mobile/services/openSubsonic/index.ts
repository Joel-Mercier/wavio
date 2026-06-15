import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import i18n from "@/config/i18n";
import { reportError } from "@/services/errorReporting";
import type { ResponseStatus } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

if (__DEV__) {
  console.log(
    "[app] Navidrome Subsonic API Version : ",
    navidromeSubsonicApiVersion,
  );
  console.log("[app] Navidrome Client : ", navidromeClient);
}

export type OpenSubsonicResponse<T> = {
  "subsonic-response": {
    status: ResponseStatus;
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: OpenSubsonicErrorResponse;
  } & T;
};

export type OpenSubsonicErrorResponse = {
  code: number;
  message?: string;
  helpUrl?: string;
};

const openSubsonicApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // Fail fast when the server is unreachable (e.g. its LAN IP changed) instead
  // of hanging on the OS TCP timeout. The reachability probe enforces its own
  // shorter deadline on top of this (see services/network.ts).
  timeout: 15000,
});

openSubsonicApiInstance.interceptors.request.use(
  (request) => {
    const { url, username, password } = useAuthBase.getState();
    request.params = {
      ...(request.params ?? {}),
      u: username,
      p: password,
      v: navidromeSubsonicApiVersion,
      c: navidromeClient,
      f: "json",
    };
    request.baseURL = url || request.baseURL || "";
    return request;
  },
  (error) => Promise.reject(error),
);

openSubsonicApiInstance.interceptors.response.use(
  (response) => {
    const envelope = response.data?.["subsonic-response"];
    const version = envelope?.serverVersion;
    if (typeof version === "string" && version.length > 0) {
      const current = useAuthBase.getState().serverVersion;
      if (current !== version) {
        useAuthBase.getState().setServerVersion(version);
      }
    }
    // Only log out on genuine credential failures (Subsonic error code 40 =
    // "Wrong username or password"). Network errors are transient and must not
    // wipe the session — offline mode depends on the user staying signed in.
    if (envelope?.status === "failed" && envelope?.error?.code === 40) {
      useAuthBase.getState().logout();
    }
    return response;
  },
  (error) => {
    // The classifier drops offline / unreachable-server / cancelled noise and
    // reports only genuine HTTP failures (4xx/5xx with a response body).
    reportError(error, {
      area: "api",
      backend: "subsonic",
      endpoint: error?.config?.url,
    });
    return Promise.reject(error);
  },
);

const KNOWN_ERROR_CODES = [10, 20, 30, 40, 41, 42, 43, 44, 50, 60, 70] as const;
const knownErrorCodeSet: ReadonlySet<number> = new Set(KNOWN_ERROR_CODES);

// Proxy so translations resolve against the *current* locale at lookup time
// rather than at module-init time (when i18n may not be ready yet, and which
// wouldn't pick up runtime locale changes).
export const openSubsonicErrorCodes = new Proxy({} as Record<number, string>, {
  get(_target, prop) {
    const code = Number(prop);
    if (!knownErrorCodeSet.has(code)) return undefined;
    return i18n.t(`openSubsonic.errorCodes.${code}`);
  },
});

export type ApiType = typeof openSubsonicApiInstance;

// Validate a Subsonic envelope, throwing the envelope error on a "failed"
// status. Used by subsonicRequest and the few non-GET endpoints.
export function subsonicEnvelope<T>(
  rsp: AxiosResponse<OpenSubsonicResponse<T>>,
): OpenSubsonicResponse<T>["subsonic-response"] {
  if (rsp.data["subsonic-response"]?.status !== "ok") {
    const error = rsp.data["subsonic-response"].error;
    // Application-level Subsonic failure (HTTP 200, status "failed"). Code 40 is
    // wrong-credentials, already handled by the response interceptor's logout —
    // don't double-report it. Everything else is a real failing endpoint.
    if (error?.code !== 40) {
      reportError(error, {
        area: "api",
        backend: "subsonic",
        endpoint: rsp.config?.url,
        status: error?.code,
      });
    }
    throw error;
  }
  return rsp.data["subsonic-response"];
}

// Shared request wrapper for the section files: performs the GET and validates
// the Subsonic envelope.
export async function subsonicRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  config: Omit<AxiosRequestConfig, "params"> = {},
): Promise<OpenSubsonicResponse<T>["subsonic-response"]> {
  return subsonicEnvelope(
    await openSubsonicApiInstance.get<OpenSubsonicResponse<T>>(path, {
      ...config,
      params,
    }),
  );
}

export default openSubsonicApiInstance;
