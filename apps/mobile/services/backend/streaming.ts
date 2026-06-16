import {
  downloadUrl as jellyfinDownloadUrl,
  hlsStreamUrl as jellyfinHlsStreamUrl,
  streamUrl as jellyfinStreamUrl,
} from "@/services/jellyfin/streaming";
import {
  parseLocalPodcastEpisodeId,
  parseLocalTrackId,
} from "@/services/local/keys";
import { getEffectiveMaxBitRate } from "@/services/network";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

function isJellyfin(): boolean {
  return useAuthBase.getState().serverType === "jellyfin";
}

// Local media plays straight from a URL the id encodes: a track id decodes to a
// `file://` URI on disk, a self-hosted podcast episode id decodes to its remote
// enclosure URL. Either way expo-audio gets the URL directly (no /stream
// endpoint, no transcoding). Returns null when `id` isn't a recognised local id.
function localFileUrl(id: string): string | null {
  // Self-hosted podcast episodes decode to their remote enclosure URL on every
  // backend (Navidrome/Jellyfin reuse the on-device podcast store), so resolve
  // them regardless of the active server type. Track ids decode to on-disk
  // `file://` URIs that only exist in local mode, so keep those gated.
  const podcastUrl = parseLocalPodcastEpisodeId(id);
  if (podcastUrl != null) return podcastUrl;
  if (useAuthBase.getState().serverType !== "local") return null;
  return parseLocalTrackId(id);
}

export const hlsStreamUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinHlsStreamUrl(id);
  const { url, username, subsonicSalt, subsonicToken } = useAuthBase.getState();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitRateParam = effective ? `&maxBitRate=${effective}` : "";
  return `${url}/rest/hls.m3u8?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const streamUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinStreamUrl(id);
  const { url, username, subsonicSalt, subsonicToken } = useAuthBase.getState();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitRateParam = effective ? `&maxBitRate=${effective}` : "";
  return `${url}/rest/stream?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`;
};

export const downloadUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinDownloadUrl(id);
  const { url, username, subsonicSalt, subsonicToken } = useAuthBase.getState();
  return `${url}/rest/download?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};
