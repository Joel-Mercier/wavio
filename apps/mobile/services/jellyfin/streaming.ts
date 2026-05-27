import { getDeviceId } from "@/services/jellyfin/deviceId";
import { getEffectiveMaxBitRate } from "@/services/network";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

const client = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "Wavio";

function baseUrl(): string {
  return useAuthBase.getState().url.replace(/\/+$/, "");
}

function authParam(): string {
  const token = useAuthBase.getState().jellyfinAccessToken ?? "";
  return `api_key=${encodeURIComponent(token)}&DeviceId=${encodeURIComponent(
    getDeviceId(),
  )}&Client=${encodeURIComponent(client)}`;
}

export function streamUrl(id: string): string {
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const userId = useAuthBase.getState().jellyfinUserId ?? "";
  const bitrate = effective ? `&MaxStreamingBitrate=${effective * 1000}` : "";
  // /Audio/{id}/universal handles direct play / transcode negotiation.
  return `${baseUrl()}/Audio/${id}/universal?UserId=${encodeURIComponent(
    userId,
  )}${bitrate}&Container=mp3,aac,flac,ogg,opus,wav&TranscodingContainer=ts&AudioCodec=aac&${authParam()}`;
}

export function hlsStreamUrl(id: string): string {
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitrate = effective ? `&MaxStreamingBitrate=${effective * 1000}` : "";
  return `${baseUrl()}/Audio/${id}/main.m3u8?${authParam()}${bitrate}`;
}

export function downloadUrl(id: string): string {
  return `${baseUrl()}/Items/${id}/Download?${authParam()}`;
}

export function artworkUrl(id?: string, size?: number): string {
  if (!id) return "";
  const sizeParam = size ? `?maxHeight=${size}&maxWidth=${size}` : "";
  return `${baseUrl()}/Items/${id}/Images/Primary${sizeParam}`;
}
