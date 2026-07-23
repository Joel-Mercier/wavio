import { Platform } from "react-native";
import { resolveServerBase } from "@/modules/ssl-trust";
import {
  JELLYFIN_DEFAULT_TRANSCODE_CODEC,
  downloadUrl as jellyfinDownloadUrl,
  hlsStreamUrl as jellyfinHlsStreamUrl,
  offlineStreamUrl as jellyfinOfflineStreamUrl,
  offlineTranscodeSuffix as jellyfinOfflineTranscodeSuffix,
  streamUrl as jellyfinStreamUrl,
  willDirectPlay as jellyfinWillDirectPlay,
} from "@/services/jellyfin/streaming";
import {
  parseLocalPodcastEpisodeId,
  parseLocalTrackId,
} from "@/services/local/keys";
import { getEffectiveMaxBitRate } from "@/services/network";
import { subsonicAuthQuery } from "@/services/openSubsonic/auth";
import type { Child } from "@/services/openSubsonic/types";
import { type StreamFormat, useAppBase } from "@/stores/app";
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
  const { url } = useAuthBase.getState();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const bitRateParam = effective ? `&maxBitRate=${effective}` : "";
  // resolveServerBase reroutes trusted self-signed hosts through the iOS
  // loopback proxy so AVPlayer can stream them (no-op on Android / untrusted).
  return resolveServerBase(
    `${url}/rest/hls.m3u8?id=${encodeURIComponent(id)}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${bitRateParam}`,
  );
};

export const streamUrl = (
  id: string,
  opts?: { forceTranscode?: boolean; timeOffset?: number },
) => {
  const local = localFileUrl(id);
  if (local != null) return local;
  if (isJellyfin()) return jellyfinStreamUrl(id, opts);
  const { url } = useAuthBase.getState();
  const params = transcodeParams(opts?.forceTranscode ?? false);
  // Subsonic `timeOffset` (integer seconds) makes the server start transcoding
  // from that point (Navidrome's `ffmpeg -ss %t`), the only way to seek within a
  // transcoded stream whose response has no length ExoPlayer can seek against.
  const timeOffset =
    opts?.timeOffset && opts.timeOffset > 0
      ? `&timeOffset=${Math.floor(opts.timeOffset)}`
      : "";
  return resolveServerBase(
    `${url}/rest/stream?id=${encodeURIComponent(id)}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json${params}${timeOffset}`,
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
  const { url } = useAuthBase.getState();
  return resolveServerBase(
    `${url}/rest/download?id=${encodeURIComponent(id)}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json`,
  );
};

// Codec (ALAC) that Android's MediaCodec advertises as supported but then fails
// to decode. A *streamed* ALAC source recovers via the player's decode-error
// transcode fallback, but a *downloaded* file has no such retry offline — so it
// must not be saved raw. Transcode it to opus at download time even in "raw"
// mode: universally decodable on Android, and — unlike a piped FLAC transcode,
// whose STREAMINFO carries no total-sample count or seek table so it plays off
// disk but can't be seeked — the Ogg container's per-page granule positions keep
// the saved file seekable. Also matches the streaming path's opus fallback
// (FALLBACK_TRANSCODE_FORMAT) so online and offline land on the same codec.
const OFFLINE_UNDECODABLE_FALLBACK_FORMAT: StreamFormat = "opus";

// Bitrate above which an MP4-container track is treated as lossless ALAC rather
// than lossy AAC (which tops out well below this). Only used on Subsonic/
// Navidrome, whose metadata reports the container mime (audio/mp4) but not the
// codec; Jellyfin names the codec directly in contentType.
const LOSSLESS_MP4_MIN_BITRATE = 500;

// Containers that can carry ALAC. `.alac` is the on-disk local-library case.
const MP4_CONTAINERS = new Set(["m4a", "mp4", "m4b", "alac"]);

// Whether the source codec is one this device can't reliably decode off disk, so
// an offline download must be transcoded even when the download format is "raw".
// Android-only: iOS/AVPlayer decodes ALAC natively, so a raw download plays
// (lossless, seekable) there — only Android's MediaCodec lacks a reliable ALAC
// decoder.
function isOfflineUndecodable(track: Child): boolean {
  if (Platform.OS !== "android") return false;
  const codec =
    typeof track.contentType === "string"
      ? track.contentType.split("/").pop()?.toLowerCase()
      : undefined;
  // Jellyfin encodes the real codec as `audio/<codec>` (e.g. audio/alac).
  if (codec === "alac") return true;
  const container = track.suffix?.toLowerCase();
  if (container && MP4_CONTAINERS.has(container)) {
    // Subsonic/Navidrome only expose the container, so a lossless-range bitrate
    // is what distinguishes ALAC from playable AAC in the same m4a container.
    if (
      typeof track.bitRate === "number" &&
      track.bitRate >= LOSSLESS_MP4_MIN_BITRATE
    ) {
      return true;
    }
  }
  return false;
}

// Where an offline download gets its bytes, and the extension the saved file
// gets. "raw" (the default) downloads the original file; any other
// downloadFormat asks the server to transcode, driven by the dedicated
// download settings (stores/app.ts) rather than the streaming ones. A raw
// download of an ALAC source is forced to a FLAC transcode so the offline file
// is decodable on Android (see OFFLINE_UNDECODABLE_FALLBACK_FORMAT).
export const offlineFileInfo = (
  track: Child,
): { url: string; suffix: string } => {
  const original = {
    url: downloadUrl(track.id),
    suffix: track.suffix || "mp3",
  };
  const { downloadFormat, downloadMaxBitRate } = useAppBase.getState();
  const format =
    downloadFormat === "raw" && isOfflineUndecodable(track)
      ? OFFLINE_UNDECODABLE_FALLBACK_FORMAT
      : downloadFormat;
  if (format === "raw") return original;
  if (localFileUrl(track.id) != null) return original;
  if (isJellyfin()) {
    return {
      url: jellyfinOfflineStreamUrl(track.id, format, downloadMaxBitRate),
      suffix: jellyfinOfflineTranscodeSuffix(format),
    };
  }
  const { url } = useAuthBase.getState();
  const bitRateParam = downloadMaxBitRate
    ? `&maxBitRate=${downloadMaxBitRate}`
    : "";
  return {
    url: resolveServerBase(
      `${url}/rest/stream?id=${encodeURIComponent(track.id)}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json&format=${format}${bitRateParam}`,
    ),
    suffix: format,
  };
};
