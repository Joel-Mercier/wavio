import {
  hostnameFromUrl,
  initTrustStore,
  refreshProxyInfo,
  refreshProxyUpstreams,
  syncClientCertificates,
} from "@/modules/ssl-trust";
import { reportError } from "@/services/errorReporting";
import { useServersBase } from "@/stores/servers";

// Backend-agnostic glue around the ssl-trust native module. Lives in services/
// root (not under a backend) since trust is host-level and shared by every
// backend. See modules/ssl-trust for the platform mechanics.

// Both routes of every remote server. The fallback has to be here too: on iOS
// `resolveServerBase` only rewrites origins registered as proxy upstreams, so an
// unregistered fallback origin would silently fail to stream under AVPlayer
// while every other request kept working.
function savedRemoteBaseUrls(): string[] {
  return useServersBase
    .getState()
    .servers.filter((s) => s.type !== "local")
    .flatMap((s) => [s.url, s.fallbackUrl])
    .filter((url): url is string => !!url);
}

/**
 * host -> mTLS KeyChain alias, derived from the saved remote servers. A server's
 * two routes are two hostnames, and either may be the one we talk to, so the
 * alias is registered against both.
 */
function savedClientCertificates(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of useServersBase.getState().servers) {
    if (s.type === "local" || !s.mtlsAlias) continue;
    for (const url of [s.url, s.fallbackUrl]) {
      if (!url) continue;
      const host = hostnameFromUrl(url);
      if (host) map[host] = s.mtlsAlias;
    }
  }
  return map;
}

/**
 * Push the host->alias map (from saved servers, plus an optional not-yet-saved
 * login entry) into the native KeyManager. Call before a login request so the
 * mTLS handshake can present the client certificate. Android-only; no-op
 * elsewhere. See modules/ssl-trust.
 */
export async function syncSslClientCertificates(extra?: {
  url: string;
  fallbackUrl?: string;
  alias?: string;
}): Promise<void> {
  try {
    const map = savedClientCertificates();
    if (extra?.alias) {
      for (const url of [extra.url, extra.fallbackUrl]) {
        if (!url) continue;
        const host = hostnameFromUrl(url);
        if (host) map[host] = extra.alias;
      }
    }
    await syncClientCertificates(map);
  } catch (err) {
    reportError(err, { area: "auth", endpoint: "ssl-trust client-cert sync" });
  }
}

/**
 * Install the custom trust manager and (on iOS) start the loopback proxy for
 * already-trusted upstreams. Call once at app startup, before the first network
 * request. Safe to call when the native module is absent (web / pre-rebuild).
 */
export async function initSslTrust(): Promise<void> {
  try {
    await initTrustStore();
    await refreshProxyUpstreams(savedRemoteBaseUrls());
    await syncClientCertificates(savedClientCertificates());
  } catch (err) {
    reportError(err, { area: "auth", endpoint: "ssl-trust init" });
  }
}

/** Re-sync the iOS loopback proxy after a trust change. No-op on Android. */
export async function syncSslProxy(): Promise<void> {
  try {
    await refreshProxyUpstreams(savedRemoteBaseUrls());
  } catch (err) {
    reportError(err, { area: "auth", endpoint: "ssl-trust proxy sync" });
  }
}

/** Refresh cached iOS proxy info on app foreground. No-op on Android. */
export async function refreshSslProxyOnForeground(): Promise<void> {
  await refreshProxyInfo();
}
