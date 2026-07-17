import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { subsonicAuthQuery } from "@/services/openSubsonic/auth";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

export const artworkUrl = (id?: string) => {
  const { url, serverType } = useAuthBase.getState();
  // For the local backend `coverArt` already holds a `file://` URI to the
  // extracted artwork on disk (see services/local/mappers.ts), so it's used
  // as-is rather than turned into a /getCoverArt request.
  if (serverType === "local") return id ?? "";
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id);
  return `${url}/rest/getCoverArt?id=${encodeURIComponent(id ?? "")}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}`;
};
