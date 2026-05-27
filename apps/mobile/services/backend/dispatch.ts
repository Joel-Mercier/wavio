import { useAuthBase } from "@/stores/auth";

export function isJellyfin(): boolean {
  return useAuthBase.getState().serverType === "jellyfin";
}

// Picks the Jellyfin implementation when the active server is Jellyfin,
// otherwise the Subsonic implementation. Return type follows the Subsonic
// signature (callers expect the OpenSubsonic envelope shape).
export function dispatch<F extends (...args: never[]) => unknown>(
  subsonic: F,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  jellyfin: (...args: any[]) => any,
): F {
  return ((...args: Parameters<F>) =>
    (isJellyfin() ? jellyfin : subsonic)(...args)) as F;
}
