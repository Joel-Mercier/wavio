import { resolveServerBase } from "@/modules/ssl-trust";
import { getDeviceId } from "@/services/jellyfin/deviceId";
import { getEffectiveMaxBitRate } from "@/services/network";
import { type StreamFormat, useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";

const client = process.env.EXPO_PUBLIC_CLIENT_NAME || "Wavio";

// Codec the decode-error fallback transcodes to — mirrors the Subsonic path's
// FALLBACK_TRANSCODE_FORMAT (services/backend/streaming.ts).
const FALLBACK_TRANSCODE_FORMAT: StreamFormat = "opus";

// The permissive accept-list used in "raw" mode: every common container the app
// can direct-play, so the source streams untouched unless the bitrate cap forces
// a transcode. Also the accept-list JELLYFIN_DEFAULT_TRANSCODE_CODEC lands on.
// A `container|codec` pair (universal-endpoint syntax, as used by jellyfin-web)
// direct-plays only that codec — m4a holds AAC (playable) or ALAC (ExoPlayer
// can't decode it), so only the AAC case direct-plays.
const RAW_CONTAINERS = "mp3,aac,m4a|aac,m4b|aac,flac,ogg,opus,wav";

// Codec a bitrate-forced transcode uses when the format is "raw". Kept in sync
// with utils/audioQuality.ts (rawTranscodeFormat) so the player's predicted
// output matches what the server actually produces.
export const JELLYFIN_DEFAULT_TRANSCODE_CODEC = "aac";

// Per streamingFormat: the codec/container to transcode to and the accept-list
// of containers to direct-play. A concrete format narrows the accept-list to
// itself so mismatched sources transcode while matching sources direct-play; the
// universal endpoint's MaxStreamingBitrate still caps either path.
function formatProfile(format: StreamFormat): {
  audioCodec: string;
  transcodingContainer: string;
  containers: string;
} {
  switch (format) {
    case "mp3":
      return {
        audioCodec: "mp3",
        transcodingContainer: "mp3",
        containers: "mp3",
      };
    case "opus":
      return {
        audioCodec: "opus",
        transcodingContainer: "ogg",
        containers: "opus,ogg",
      };
    case "flac":
      return {
        audioCodec: "flac",
        transcodingContainer: "flac",
        containers: "flac",
      };
    case "aac":
      return {
        audioCodec: "aac",
        transcodingContainer: "ts",
        containers: "aac,m4a|aac,m4b|aac",
      };
    default:
      return {
        audioCodec: JELLYFIN_DEFAULT_TRANSCODE_CODEC,
        transcodingContainer: "ts",
        containers: RAW_CONTAINERS,
      };
  }
}

// Predicts whether the universal endpoint will direct-play this track under the
// given format: its container must appear in the profile's accept-list, and a
// `container|codec` entry additionally requires the codec to match. Mirrors the
// server's negotiation so the player knows whether the stream is natively
// seekable (direct play) or must be reloaded at a StartTimeTicks offset
// (transcode). An unknown container means the server would transcode.
export function willDirectPlay(
  track: QueueTrack,
  format: StreamFormat,
): boolean {
  const container = track.suffix?.toLowerCase();
  if (!container) return false;
  const codec =
    typeof track.contentType === "string"
      ? track.contentType.split("/").pop()?.toLowerCase()
      : undefined;
  return formatProfile(format)
    .containers.split(",")
    .some((entry) => {
      const [entryContainer, entryCodec] = entry.split("|");
      if (entryContainer !== container) return false;
      return !entryCodec || entryCodec === codec;
    });
}

type StreamOptions = { forceTranscode?: boolean; timeOffset?: number };

// .NET ticks per second (1 tick = 100ns). Jellyfin expresses all offsets/
// durations in these, so seconds → ticks is × this.
const TICKS_PER_SECOND = 10_000_000;

// The transcode-negotiation query shared by streamUrl/hlsStreamUrl: maps the
// streamingFormat setting onto the universal endpoint's Container/AudioCodec/
// TranscodingContainer and passes the effective bitrate cap as both the
// direct-play ceiling (MaxStreamingBitrate) and the encode target (AudioBitRate).
// `timeOffset` (seconds) becomes StartTimeTicks so seeking within a transcoded
// stream re-requests it from that point (ffmpeg -ss) — the stream is served
// without a seekable length, so a native seekTo would just restart it.
function transcodeParams(opts?: StreamOptions): string {
  const { maxBitRate, cellularMaxBitRate, streamingFormat } =
    useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const format = opts?.forceTranscode
    ? FALLBACK_TRANSCODE_FORMAT
    : streamingFormat;
  const { audioCodec, transcodingContainer, containers } =
    formatProfile(format);
  const parts = [
    `Container=${containers}`,
    `AudioCodec=${audioCodec}`,
    `TranscodingContainer=${transcodingContainer}`,
  ];
  if (effective) {
    parts.push(`MaxStreamingBitrate=${effective * 1000}`);
    parts.push(`AudioBitRate=${effective * 1000}`);
  }
  if (opts?.timeOffset && opts.timeOffset > 0) {
    parts.push(
      `StartTimeTicks=${Math.round(opts.timeOffset * TICKS_PER_SECOND)}`,
    );
  }
  return parts.join("&");
}

function baseUrl(): string {
  return useAuthBase.getState().url.replace(/\/+$/, "");
}

function authParam(): string {
  const token = useAuthBase.getState().jellyfinAccessToken ?? "";
  return `api_key=${encodeURIComponent(token)}&DeviceId=${encodeURIComponent(
    getDeviceId(),
  )}&Client=${encodeURIComponent(client)}`;
}

export function streamUrl(id: string, opts?: StreamOptions): string {
  const userId = useAuthBase.getState().jellyfinUserId ?? "";
  // /Audio/{id}/universal handles direct play / transcode negotiation.
  // resolveServerBase reroutes trusted self-signed hosts through the iOS
  // loopback proxy so AVPlayer can stream them (no-op on Android / untrusted).
  return resolveServerBase(
    `${baseUrl()}/Audio/${id}/universal?UserId=${encodeURIComponent(
      userId,
    )}&${transcodeParams(opts)}&${authParam()}`,
  );
}

export function hlsStreamUrl(id: string, opts?: StreamOptions): string {
  return resolveServerBase(
    `${baseUrl()}/Audio/${id}/main.m3u8?${authParam()}&${transcodeParams(opts)}`,
  );
}

export function downloadUrl(id: string): string {
  return `${baseUrl()}/Items/${id}/Download?${authParam()}`;
}

export function artworkUrl(id?: string, size?: number): string {
  if (!id) return "";
  const sizeParam = size ? `?maxHeight=${size}&maxWidth=${size}` : "";
  return `${baseUrl()}/Items/${id}/Images/Primary${sizeParam}`;
}
