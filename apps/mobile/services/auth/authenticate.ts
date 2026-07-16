import axios from "axios";
import i18n from "@/config/i18n";
import {
  getCertificateInfo,
  isCertificateTrusted,
  isSSLError,
  isSslTrustAvailable,
} from "@/modules/ssl-trust";
import { createBareClient } from "@/services/backend/probe";
import { authenticateByName as jellyfinAuthenticate } from "@/services/jellyfin/auth";
import { nativeLogin } from "@/services/navidrome/auth";
import { openSubsonicErrorCodes } from "@/services/openSubsonic";
import {
  computeSubsonicToken,
  encodePasswordParam,
  generateSalt,
} from "@/services/openSubsonic/auth";
import type { ServerType } from "@/stores/servers";

// Options object accepted by the auth store's `login()`. Produced here so both
// the login form and the silent server-switch screen share one authentication
// path. Backend-agnostic, hence it lives in services/ root rather than under a
// single backend dir.
export type RemoteLoginOptions = {
  serverType: ServerType;
  navidrome?: {
    token: string;
    userId: string;
    isAdmin: boolean;
  } | null;
  jellyfin?: {
    accessToken: string;
    userId: string;
    isAdmin: boolean;
  } | null;
  subsonicSalt?: string | null;
  subsonicToken?: string | null;
  useTokenAuth?: boolean;
};

// Thrown when the server's TLS certificate isn't trusted (self-signed / unknown
// CA). Carries the URL so the login UI can offer to inspect and trust the cert
// (Trust-On-First-Use) and then retry.
export class SslUntrustedError extends Error {
  url: string;
  constructor(url: string) {
    super("SSL certificate not trusted");
    this.name = "SslUntrustedError";
    this.url = url;
  }
}

// A thrown network failure (not a Subsonic credential error) whose message
// looks like a TLS/certificate problem. Walks `message` / `code` / `cause`
// since axios on RN often nests the real reason under a generic wrapper.
function isTlsError(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { message?: unknown; code?: unknown; cause?: unknown };
  const parts: string[] = [];
  if (typeof e.message === "string") parts.push(e.message);
  if (typeof e.code === "string") parts.push(e.code);
  if (e.cause != null) {
    const cause = e.cause as { message?: unknown };
    parts.push(
      typeof cause.message === "string" ? cause.message : String(e.cause),
    );
  }
  return isSSLError(parts.join(" "));
}

// Run a network call, converting a TLS/certificate failure into a typed
// SslUntrustedError so the caller can drive the trust-on-first-use flow.
async function withSslDetection<T>(
  url: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTlsError(err)) throw new SslUntrustedError(url);
    // React Native frequently collapses a TLS handshake failure into a generic
    // "Network Error", so the message heuristic above can miss it. For an
    // ambiguous failure on an https URL, probe the certificate directly: if the
    // server presents one the system doesn't trust, it's a trust problem, not
    // an unreachable server. Gated on the native module and a real connection
    // failure (no HTTP response came back).
    if (
      isSslTrustAvailable() &&
      url.toLowerCase().startsWith("https:") &&
      !(axios.isAxiosError(err) && err.response)
    ) {
      try {
        const info = await getCertificateInfo(url);
        // If we've already trusted this host's cert and the request STILL
        // fails, re-prompting is futile — the real problem is elsewhere (an
        // unreachable upstream, a dead endpoint behind the cert, etc.). Surface
        // the original error instead of looping the trust prompt.
        const alreadyTrusted = await isCertificateTrusted(info.hostname);
        if (!info.systemTrusted && !alreadyTrusted) {
          throw new SslUntrustedError(url);
        }
      } catch (probeErr) {
        if (probeErr instanceof SslUntrustedError) throw probeErr;
        // Inspection itself failed (genuinely unreachable): fall through to the
        // original error.
      }
    }
    throw err;
  }
}

// Authenticate against a remote server and return the `login()` options. Does
// not touch any store, so callers stay in control of when the session flips to
// authenticated. Throws on failure (bad credentials, unreachable server,
// untrusted TLS certificate -> SslUntrustedError).
export async function authenticateRemote(
  type: ServerType,
  url: string,
  username: string,
  password: string,
): Promise<RemoteLoginOptions> {
  const trimmedUrl = url.trim();
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (type === "jellyfin") {
    const payload = await withSslDetection(trimmedUrl, () =>
      jellyfinAuthenticate(trimmedUrl, trimmedUsername, trimmedPassword),
    );
    return {
      serverType: "jellyfin",
      jellyfin: {
        accessToken: payload.AccessToken,
        userId: payload.User.Id,
        isAdmin: !!payload.User.Policy?.IsAdministrator,
      },
    };
  }

  if (type === "local") {
    throw new Error("authenticateRemote does not support local libraries");
  }

  const subsonicSalt = generateSalt();
  const subsonicToken = await computeSubsonicToken(
    trimmedPassword,
    subsonicSalt,
  );

  const pingClient = createBareClient(trimmedUrl);
  const ping = (authParams: Record<string, string>) =>
    pingClient.get("/rest/ping", {
      params: {
        u: trimmedUsername,
        ...authParams,
        v: process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION,
        c: process.env.EXPO_PUBLIC_CLIENT_NAME,
        f: "json",
      },
    });

  // Negotiate the auth mechanism: prefer Subsonic token auth (`t`/`s`), but fall
  // back to password auth (`p`) for servers that reject token auth — LMS/Lyrion's
  // Subsonic bridge answers OpenSubsonic error 41/42 ("mechanism not supported").
  let useTokenAuth = true;
  let rsp = await withSslDetection(trimmedUrl, () =>
    ping({ t: subsonicToken, s: subsonicSalt }),
  );
  let subsonicResponse = rsp.data?.["subsonic-response"];
  if (
    subsonicResponse?.status !== "ok" &&
    (subsonicResponse?.error?.code === 41 ||
      subsonicResponse?.error?.code === 42)
  ) {
    useTokenAuth = false;
    rsp = await ping({ p: encodePasswordParam(trimmedPassword) });
    subsonicResponse = rsp.data?.["subsonic-response"];
  }

  // A wrong URL (e.g. missing the server's base path) reaches something that
  // isn't Navidrome — a reverse proxy root, a login page, etc. — which answers
  // 200 with a non-Subsonic body. Guard against a missing envelope / error code
  // so we surface the friendly "verify your server" message instead of a raw
  // "Cannot read property 'error' of undefined" TypeError.
  if (subsonicResponse?.status !== "ok") {
    const code = subsonicResponse?.error?.code;
    const message =
      (typeof code === "number" ? openSubsonicErrorCodes[code] : undefined) ??
      i18n.t("auth.login.loginErrorMessage");
    throw new Error(message);
  }

  let navidrome: RemoteLoginOptions["navidrome"] = null;
  if (type === "navidrome") {
    try {
      const payload = await nativeLogin(
        trimmedUrl,
        trimmedUsername,
        trimmedPassword,
      );
      if (payload?.token && payload?.id) {
        navidrome = {
          token: payload.token,
          userId: payload.id,
          isAdmin: !!payload.isAdmin,
        };
      }
    } catch (err) {
      console.warn(
        "[auth] Navidrome native /auth/login unavailable, falling back to Subsonic-only mode",
        err,
      );
    }
  }

  return {
    serverType: type,
    navidrome,
    subsonicSalt: useTokenAuth ? subsonicSalt : null,
    subsonicToken: useTokenAuth ? subsonicToken : null,
    useTokenAuth,
  };
}

/**
 * A failure where nothing answered: a timeout, DNS failure, refused connection.
 * An axios error carrying a `response` means the far side *did* reply, so the
 * URL is reachable and the problem lies elsewhere.
 */
function isUnreachableError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

/**
 * Authenticate against a server's primary URL, falling back to its alternative
 * address when the primary can't be reached at all.
 *
 * Wraps `authenticateRemote` rather than extending it: that function targets one
 * exact URL and stays the retry unit for the certificate-trust flow.
 *
 * Only an *unreachable* primary triggers the fallback:
 * - `SslUntrustedError` is rethrown. It can only be raised when the primary was
 *   actually reached (withSslDetection completes a handshake to inspect the
 *   cert), so it means "reachable but untrusted" — the user has to resolve it,
 *   and quietly using the fallback would hide that.
 * - A credential/envelope error is rethrown. The primary answered and rejected
 *   us; the same credentials would be rejected by the fallback too, and falling
 *   back would replace a precise message with a vague one.
 */
export async function authenticateWithFallback(
  type: ServerType,
  url: string,
  fallbackUrl: string | undefined,
  username: string,
  password: string,
): Promise<{ options: RemoteLoginOptions; activeUrl: string }> {
  const trimmedUrl = url.trim();
  const trimmedFallback = fallbackUrl?.trim();
  try {
    const options = await authenticateRemote(
      type,
      trimmedUrl,
      username,
      password,
    );
    return { options, activeUrl: trimmedUrl };
  } catch (primaryError) {
    if (!trimmedFallback || !isUnreachableError(primaryError))
      throw primaryError;
    try {
      const options = await authenticateRemote(
        type,
        trimmedFallback,
        username,
        password,
      );
      return { options, activeUrl: trimmedFallback };
    } catch (fallbackError) {
      // The fallback host's certificate isn't trusted yet. Surface *this* error:
      // it carries the fallback's URL, so the trust-on-first-use dialog prompts
      // for the right host and the retry then succeeds.
      if (fallbackError instanceof SslUntrustedError) throw fallbackError;
      // Otherwise report the primary's failure — that's the URL the user typed
      // and expects to hear about.
      throw primaryError;
    }
  }
}
