import i18n from "@/config/i18n";
import { useAuthBase } from "@/stores/auth";

// Mirrors services/jellyfin/unsupported.ts for the on-device SQLite backend.
// `localEnvelope` wraps a payload in the OpenSubsonic `subsonic-response` shape
// so local section functions return exactly what the Subsonic ones do, letting
// the existing hooks/backend hooks consume them unchanged.

export class LocalUnsupportedError extends Error {
  // `feature` is an optional internal hint (e.g. a malformed id from browsing.ts)
  // kept in English for logs; with no feature the message is the localized,
  // user-facing "operation not supported" string.
  constructor(feature?: string) {
    super(
      feature
        ? `The local library does not support ${feature}`
        : i18n.t("app.localLibrary.unsupported"),
    );
    this.name = "LocalUnsupportedError";
  }
}

export function localEnvelope<T>(payload: T): T & {
  status: "ok";
  version: string;
  type: string;
  serverVersion: string;
  openSubsonic: boolean;
} {
  return {
    ...payload,
    status: "ok" as const,
    version: "1.16.1",
    type: "local",
    serverVersion: useAuthBase.getState().serverVersion ?? "",
    openSubsonic: true,
  };
}

// Default target for endpoints with no local implementation. `dispatch` routes
// here when the local backend is active but a section didn't supply a local fn,
// so an un-backed feature fails loudly rather than silently hitting the network.
export function localUnsupported(..._args: unknown[]): never {
  throw new LocalUnsupportedError();
}
