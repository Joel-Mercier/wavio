import {
  downloadUrl as jellyfinDownloadUrl,
  hlsStreamUrl as jellyfinHlsStreamUrl,
  streamUrl as jellyfinStreamUrl,
} from "@/services/jellyfin/streaming";
import { parseLocalTrackId } from "@/services/local/keys";
import { getEffectiveMaxBitRate } from "@/services/network";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

function isJellyfin(): boolean {
  return useAuthBase.getState().serverType === "jellyfin";
}

// Local tracks play straight off disk: the id encodes the file URI, so we hand
// expo-audio the `file://` URI directly (no /stream endpoint, no transcoding).
// Returns null when the active server isn't local or `id` isn't a local id.
function localFileUrl(id: string): string | null {
  return useAuthBase.getState().serverType === "local"
    ? parseLocalTrackId(id)
    : null;
}

export const hlsStreamUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinHlsStreamUrl(id);
  const { url, username, password } = useAuthBase.getState();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitRateParam = effective ? `&maxBitRate=${effective}` : "";
  return `${url}/rest/hls.m3u8?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const streamUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinStreamUrl(id);
  const { url, username, password } = useAuthBase.getState();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitRateParam = effective ? `&maxBitRate=${effective}` : "";
  return `${url}/rest/stream?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const downloadUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinDownloadUrl(id);
  const { url, username, password } = useAuthBase.getState();
  return `${url}/rest/download?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};
