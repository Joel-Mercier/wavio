import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { getIsEffectivelyOnline } from "@/services/network";
import { subsonicAuthQuery } from "@/services/openSubsonic/auth";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

export const artworkUrl = (id?: string, size?: number) => {
  const { url, serverType } = useAuthBase.getState();
  // For the local backend `coverArt` already holds a `file://` URI to the
  // extracted artwork on disk (see services/local/mappers.ts), so it's used
  // as-is rather than turned into a /getCoverArt request.
  if (serverType === "local") return id ?? "";
  // Covers cached to disk by the extended-offline library sync replace the
  // server URL while it's unreachable, so offline screens keep their artwork.
  if (id && !getIsEffectivelyOnline()) {
    const cached = useOffline.getState().artworkCache[id];
    if (cached) return cached;
  }
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id, size);
  const sizeParam = size ? `&size=${size}` : "";
  return `${url}/rest/getCoverArt?id=${encodeURIComponent(id ?? "")}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}${sizeParam}`;
};
