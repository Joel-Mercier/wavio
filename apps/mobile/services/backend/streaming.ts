import { resolveServerBase } from "@/modules/ssl-trust";
import {
  JELLYFIN_DEFAULT_TRANSCODE_CODEC,
  downloadUrl as jellyfinDownloadUrl,
  hlsStreamUrl as jellyfinHlsStreamUrl,
  streamUrl as jellyfinStreamUrl,
  willDirectPlay as jellyfinWillDirectPlay,
} from "@/services/jellyfin/streaming";
import {
  parseLocalPodcastEpisodeId,
  parseLocalTrackId,
} from "@/services/local/keys";
import { getEffectiveMaxBitRate } from "@/services/network";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import { getTranscodeInfo, type TranscodeInfo } from "@/utils/audioQuality";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

function isJellyfin(): boolean {
  return useAuthBase.getState().serverType === "jellyfin";
}

// Codec the decode-error fallback transcodes to: native on every modern
// Android, best quality-per-bitrate, and shipped by default in Navidrome's
// transcoding config.
const FALLBACK_TRANSCODE_FORMAT = "opus";

// Subsonic transcoding query (`&format=…&maxBitRate=…`) shared by the stream
// endpoints. `format=raw` is omitted entirely so the server streams the source
// untouched. `forceTranscode` overrides a "raw" preference with a known-good
// codec — used to recover from a device that can't decode the source.
function transcodeParams(forceTranscode: boolean): string {
  const { maxBitRate, cellularMaxBitRate, streamingFormat } =
    useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const format = forceTranscode ? FALLBACK_TRANSCODE_FORMAT : streamingFormat;
  const parts: string[] = [];
  if (format && format !== "raw") parts.push(`format=${format}`);
  if (effective) parts.push(`maxBitRate=${effective}`);
  return parts.length ? `&${parts.join("&")}` : "";
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
  // resolveServerBase reroutes trusted self-signed hosts through the iOS
  // loopback proxy so AVPlayer can stream them (no-op on Android / untrusted).
  return resolveServerBase(
    `${url}/rest/hls.m3u8?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`,
  );
};

export const streamUrl = (
  id: string,
  opts?: { forceTranscode?: boolean; timeOffset?: number },
) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinStreamUrl(id, opts);
  const { url, username, subsonicSalt, subsonicToken } = useAuthBase.getState();
  const params = transcodeParams(opts?.forceTranscode ?? false);
  // Subsonic `timeOffset` (integer seconds) makes the server start transcoding
  // from that point (Navidrome's `ffmpeg -ss %t`), the only way to seek within a
  // transcoded stream whose response has no length ExoPlayer can seek against.
  const timeOffset =
    opts?.timeOffset && opts.timeOffset > 0
      ? `&timeOffset=${Math.floor(opts.timeOffset)}`
      : "";
  return resolveServerBase(
    `${url}/rest/stream?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${params}${timeOffset}`,
  );
};

// Backend-aware transcode prediction for the active streaming settings. The
// generic getTranscodeInfo comparison (suffix vs streamingFormat) matches
// Subsonic's `format=` semantics; Jellyfin instead negotiates against the
// universal endpoint's container accept-list, so its branch derives the format
// transcode from willDirectPlay. Keeping both call sites (seek handling in
// services/player.ts, the player screen's AudioQualityLine) on this helper
// keeps the prediction consistent with the URLs built above.
export function trackTranscodeInfo(track: QueueTrack | null): TranscodeInfo {
  const inactive: TranscodeInfo = {
    active: false,
    fromLabel: null,
    toLabel: null,
  };
  if (!track) return inactive;
  const { maxBitRate, cellularMaxBitRate, streamingFormat } =
    useAppBase.getState();
  const effectiveMaxBitRate = getEffectiveMaxBitRate(
    maxBitRate,
    cellularMaxBitRate,
  );
  if (isJellyfin()) {
    return getTranscodeInfo(track, {
      streamingFormat,
      effectiveMaxBitRate,
      rawTranscodeFormat: JELLYFIN_DEFAULT_TRANSCODE_CODEC,
      formatTranscode: !jellyfinWillDirectPlay(track, streamingFormat),
    });
  }
  const type = useAuthBase.getState().serverType;
  if (type !== "opensubsonic" && type !== "navidrome") return inactive;
  return getTranscodeInfo(track, { streamingFormat, effectiveMaxBitRate });
}

export const downloadUrl = (id: string) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinDownloadUrl(id);
  const { url, username, subsonicSalt, subsonicToken } = useAuthBase.getState();
  return `${url}/rest/download?id=${id}&u=${username}&t=${subsonicToken}&s=${subsonicSalt}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`;
};
