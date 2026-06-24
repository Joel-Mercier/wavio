import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

export const artworkUrl = (id?: string) => {
  const { url, username, subsonicSalt, subsonicToken, serverType } =
    useAuthBase.getState();
  // For the local backend `coverArt` already holds a `file://` URI to the
  // extracted artwork on disk (see services/local/mappers.ts), so it's used
  // as-is rather than turned into a /getCoverArt request.
  if (serverType === "local") return id ?? "";
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id);
  // Authenticate with the salted token (t/s) like every other Subsonic URL
  // builder (interceptor, streaming) — not cleartext `p` — and URL-encode the
  // credentials so passwords with reserved characters don't break the query.
  return `${url}/rest/getCoverArt?id=${encodeURIComponent(id ?? "")}&u=${encodeURIComponent(username)}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}`;
};
