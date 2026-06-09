import { localUnsupported } from "@/services/local/unsupported";
import { useAuthBase } from "@/stores/auth";

export function isJellyfin(): boolean {
  return useAuthBase.getState().serverType === "jellyfin";
}

// `local` is a first-class server type (chosen at login like Navidrome /
// Jellyfin). When the active server is local, backend calls are served from the
// on-device SQLite index (services/local/*) instead of any remote server, so
// remote and local content can never bleed into each other.
export function isLocal(): boolean {
  return useAuthBase.getState().serverType === "local";
}

// Picks the backend implementation for the active mode. Return type follows the
// Subsonic signature (callers expect the OpenSubsonic envelope shape):
//  - local mode active  → `local` (falls back to `localUnsupported`, which
//    throws, when a section has no local implementation),
//  - else Jellyfin server → `jellyfin`,
//  - else                 → `subsonic`.
export function dispatch<F extends (...args: never[]) => unknown>(
  subsonic: F,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  jellyfin: (...args: any[]) => any,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  local?: (...args: any[]) => any,
): F {
  return ((...args: Parameters<F>) => {
    if (isLocal()) return (local ?? localUnsupported)(...args);
    return (isJellyfin() ? jellyfin : subsonic)(...args);
  }) as F;
}
