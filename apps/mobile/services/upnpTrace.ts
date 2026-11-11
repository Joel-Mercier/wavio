// TEMPORARY (issue #220): JS-side lines for the casting log the native UPnP
// module records (modules/upnp-cast/.../UpnpTrace.kt). Remove with it once the
// Sonos reports are in.
import Native from "@/modules/upnp-cast";

export const isUpnpTraceAvailable = (): boolean =>
  typeof Native?.isTracing === "function";

export function upnpTrace(message: string | (() => string)): void {
  if (!Native?.isTracing?.()) return;
  try {
    Native.trace(typeof message === "function" ? message() : message);
  } catch {
    // Diagnostics must never get in the way of playback.
  }
}

export const isUpnpTracing = (): boolean => Native?.isTracing?.() ?? false;

export const hasUpnpTrace = (): boolean => Native?.hasTrace?.() ?? false;

export function setUpnpTracing(enabled: boolean): boolean {
  return Native?.setTracing?.(enabled) ?? false;
}

export async function shareUpnpTrace(header: string): Promise<boolean> {
  return (await Native?.shareTrace?.(header)) ?? false;
}
