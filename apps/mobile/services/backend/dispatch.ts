import {
  filesAreOnDeviceType,
  hasNetworkServerType,
  isIndexBackedType,
  isSingletonServerType,
  speaksHttpType,
} from "@/services/backend/serverTraits";
import { localUnsupported } from "@/services/local/unsupported";
import { useAuthBase } from "@/stores/auth";
import type { ServerType } from "@/stores/servers";

/** The active server's type. */
export function activeServerType(): ServerType {
  return useAuthBase.getState().serverType;
}

export function isJellyfin(): boolean {
  return activeServerType() === "jellyfin";
}

export function isNavidrome(): boolean {
  return activeServerType() === "navidrome";
}

// `local` is a first-class server type (chosen at login like Navidrome /
// Jellyfin). Prefer the trait predicates below over this one: most checks that
// used to spell `isLocal()` actually meant one of the four properties local
// happens to have, and those come apart for network file shares. Keep `isLocal`
// only where the check genuinely means "the on-device library" as a product
// concept — its icon, its name, its setup help.
export function isLocal(): boolean {
  return activeServerType() === "local";
}

/** Backend calls are answered from the on-device SQLite index. */
export function isIndexBacked(): boolean {
  return isIndexBackedType(activeServerType());
}

/** The bytes are on this phone — no fetch, no bandwidth, no server transcode. */
export function filesAreOnDevice(): boolean {
  return filesAreOnDeviceType(activeServerType());
}

/** There is a server to reach, authenticate against and probe. */
export function hasNetworkServer(): boolean {
  return hasNetworkServerType(activeServerType());
}

/** One row only, with a sentinel identity and a fixed storage scope. */
export function isSingletonServer(): boolean {
  return isSingletonServerType(activeServerType());
}

/** Talks HTTP(S) to a host, so per-host headers and TLS trust apply. */
export function speaksHttp(): boolean {
  return speaksHttpType(activeServerType());
}

// Picks the backend implementation for the active mode. Return type follows the
// Subsonic signature (callers expect the OpenSubsonic envelope shape):
//  - index-backed server → `index` (falls back to `localUnsupported`, which
//    throws, when a section has no on-device implementation),
//  - else Jellyfin server → `jellyfin`,
//  - else                 → `subsonic`.
//
// The third slot keys off `isIndexBacked`, not the server type: services/local/*
// reads the SQLite index and does not care whether the indexer filled it from
// this phone's storage or from a network share.
export function dispatch<F extends (...args: never[]) => unknown>(
  subsonic: F,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  jellyfin: (...args: any[]) => any,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  index?: (...args: any[]) => any,
): F {
  return ((...args: Parameters<F>) => {
    if (isIndexBacked()) return (index ?? localUnsupported)(...args);
    return (isJellyfin() ? jellyfin : subsonic)(...args);
  }) as F;
}
