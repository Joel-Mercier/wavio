const navidromeUrl = process.env.EXPO_PUBLIC_NAVIDROME_URL || "";
const navidromeUsername = process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || "";
const navidromePassword = process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD || "";
const navidromeSubsonicApiVersion = process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

export const hlsStreamUrl = (id: string) => {
  return `${navidromeUrl}/rest/hls.m3u8?id=${id}&u=${navidromeUsername}&p=${navidromePassword}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
}

export const streamUrl = (id: string) => {
  return `${navidromeUrl}/rest/stream?id=${id}&u=${navidromeUsername}&p=${navidromePassword}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
}