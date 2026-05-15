import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

export const artworkUrl = (id?: string) => {
  const { url, username, password, serverType } = useAuthBase.getState();
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id);
  return `${url}/rest/getCoverArt?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}`;
};
