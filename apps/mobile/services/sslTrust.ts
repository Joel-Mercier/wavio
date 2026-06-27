import {
  initTrustStore,
  refreshProxyInfo,
  refreshProxyUpstreams,
} from "@/modules/ssl-trust";
import { reportError } from "@/services/errorReporting";
import { useServersBase } from "@/stores/servers";

// Backend-agnostic glue around the ssl-trust native module. Lives in services/
// root (not under a backend) since trust is host-level and shared by every
// backend. See modules/ssl-trust for the platform mechanics.

function savedRemoteBaseUrls(): string[] {
  return useServersBase
    .getState()
    .servers.filter((s) => s.type !== "local")
    .map((s) => s.url);
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
