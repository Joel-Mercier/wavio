import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { getIsEffectivelyOnline } from "@/services/network";
import { subsonicAuthQuery } from "@/services/openSubsonic/auth";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import { artworkCacheKey } from "@/utils/artworkCacheKey";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

// Resolves a cover id against the offline artwork cache, following the alias
// table when the id has no file of its own (track covers point at their
// album's, artist ids at the artist's cover — see stores/offline.ts). Takes the
// maps rather than reading the store so React consumers can memoize on them.
export const resolveCachedArtwork = (
  id: string | undefined,
  artworkCache: Record<string, string>,
  artworkAliases: Record<string, string>,
): string | undefined => {
  if (!id) return undefined;
  const key = artworkCacheKey(id);
  const direct = artworkCache[key];
  if (direct) return direct;
  const alias = artworkAliases[key];
  return alias ? artworkCache[alias] : undefined;
};

export const artworkUrl = (id?: string, size?: number) => {
  const { url, serverType } = useAuthBase.getState();
  // For the local backend `coverArt` already holds a `file://` URI to the
  // extracted artwork on disk (see services/local/mappers.ts), so it's used
  // as-is rather than turned into a /getCoverArt request.
  if (serverType === "local") return id ?? "";
  // Covers cached to disk by the extended-offline library sync replace the
  // server URL while it's unreachable, so offline screens keep their artwork.
  if (id && !getIsEffectivelyOnline()) {
    const { artworkCache, artworkAliases } = useOffline.getState();
    const cached = resolveCachedArtwork(id, artworkCache, artworkAliases);
    if (cached) return cached;
  }
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id, size);
  const sizeParam = size ? `&size=${size}` : "";
  return `${url}/rest/getCoverArt?id=${encodeURIComponent(id ?? "")}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}${sizeParam}`;
};
