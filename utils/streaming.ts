import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

export const hlsStreamUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  return `${url}/rest/hls.m3u8?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};

export const streamUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  return `${url}/rest/stream?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};

export const downloadUrl = (id: string) => {
  const { url, username, password } = useAuthBase.getState();
  return `${url}/rest/download?id=${id}&u=${username}&p=${password}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};
