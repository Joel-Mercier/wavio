import { requireOptionalNativeModule } from "expo";

/**
 * Android's shared HTTP stack: owns React Native's OkHttp factory and routes
 * https requests through Cronet (HTTP/3 over QUIC when the server advertises
 * it) while HTTP/3 is enabled. See the native sources for the routing rules.
 * Absent on iOS (URLSession already speaks HTTP/3), on web and under jest.
 */

export type HttpProtocol = "h3" | "h2" | "http/1.1" | "http/1.0" | string;

export type EngineState = "idle" | "starting" | "ready" | "failed";

/** Why a host stays off Cronet: a trusted self-signed or client certificate, or a recent TLS failure. */
export type HostBlocker = "custom-tls" | "tls-fallback";

export type HostTransport = {
  protocol: HttpProtocol | null;
  blocker: HostBlocker | null;
};

type HttpStackNativeModule = {
  setHttp3Enabled(enabled: boolean): void;
  getEngineState(): EngineState;
  getHostTransport(host: string): HostTransport;
  addListener(event: "change", listener: () => void): { remove: () => void };
};

const Native = requireOptionalNativeModule<HttpStackNativeModule>("HttpStack");

export const isHttpStackAvailable = (): boolean => Native != null;

export function setHttp3Enabled(enabled: boolean): void {
  Native?.setHttp3Enabled(enabled);
}

export function getEngineState(): EngineState | null {
  return Native?.getEngineState() ?? null;
}

export function getHostTransport(host: string): HostTransport | null {
  if (!host) return null;
  return Native?.getHostTransport(host) ?? null;
}

/** Fires when the engine state, a host's protocol or a host's blocker changes. */
export function addTransportChangeListener(listener: () => void): () => void {
  const subscription = Native?.addListener("change", listener);
  return () => subscription?.remove();
}
