import {
  getEngineState,
  getHostTransport,
  isHttpStackAvailable,
  setHttp3Enabled,
} from "@/modules/http-stack";
import { hostnameFromUrl } from "@/modules/ssl-trust";
import { useAppBase } from "@/stores/app";

export type Http3Status =
  | "active"
  | "inactive"
  | "cleartext"
  | "customTls"
  | "tlsFallback"
  | "unavailable";

/**
 * Mirrors the HTTP/3 setting into the native stack, which reads its own copy at
 * process start (an Android Auto cold boot routes before any JS runs). Pushes
 * once, then on every change, including a backup restore.
 */
export function initHttpTransport(): () => void {
  if (!isHttpStackAvailable()) return () => {};
  setHttp3Enabled(useAppBase.getState().http3Enabled);
  return useAppBase.subscribe((state, previous) => {
    if (state.http3Enabled !== previous.http3Enabled) {
      setHttp3Enabled(state.http3Enabled);
    }
  });
}

/**
 * Whether this server's last response came over HTTP/3, or why it can't.
 * Null while there's nothing to report yet: the engine is still starting, or
 * no response has come back since HTTP/3 was turned on.
 */
export function http3StatusForUrl(url: string): Http3Status | null {
  const engine = getEngineState();
  if (engine === null || engine === "failed") return "unavailable";
  if (url.trim().toLowerCase().startsWith("http://")) return "cleartext";
  const host = getHostTransport(hostnameFromUrl(url));
  if (host?.blocker === "custom-tls") return "customTls";
  if (engine !== "ready") return null;
  if (host?.blocker === "tls-fallback") return "tlsFallback";
  if (!host?.protocol) return null;
  return host.protocol === "h3" ? "active" : "inactive";
}
