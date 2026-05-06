import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

export const hlsStreamUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  const { maxBitRate } = useAppBase.getState();
  const bitRateParam = maxBitRate ? `&maxBitRate=${maxBitRate}` : "";
  return `${url}/rest/hls.m3u8?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const streamUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  const { maxBitRate } = useAppBase.getState();
  const bitRateParam = maxBitRate ? `&maxBitRate=${maxBitRate}` : "";
  return `${url}/rest/stream?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const downloadUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  return `${url}/rest/download?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};
