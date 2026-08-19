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
import {
  getEffectiveMaxBitRate,
  getEffectiveStreamingFormat,
} from "@/services/network";
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

// Streaming format for the current network: the cellular pick when there is one
// and the device is on cellular, the Wi-Fi one otherwise.
function activeStreamingFormat(): StreamFormat {
  const { streamingFormat, cellularStreamingFormat } = useAppBase.getState();
  return getEffectiveStreamingFormat(streamingFormat, cellularStreamingFormat);
}

// Subsonic transcoding query (`&format=…&maxBitRate=…`) shared by the stream
// endpoints. A "raw" format omits the param entirely rather than sending
// `format=raw`, and the difference matters: Navidrome answers `format=raw` with
// the untouched source and ignores `maxBitRate`, while an absent format lets a
// bitrate cap downsample to the server's own DefaultDownsamplingFormat. Omitting
// it is what makes "original on Wi-Fi, capped on cellular" work at all.
// `forceTranscode` overrides a "raw" preference with a known-good codec — used
// to recover from a device that can't decode the source.
function transcodeParams(forceTranscode: boolean): string {
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effective = getEffectiveMaxBitRate(maxBitRate, cellularMaxBitRate);
  const format = forceTranscode
    ? FALLBACK_TRANSCODE_FORMAT
    : activeStreamingFormat();
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

// Bitrate the waveform analysis copy is transcoded at. A waveform only needs the
// amplitude envelope, which survives heavy lossy compression intact, so this is
// purely about not pulling a 40 MB FLAC to draw 1024 bars — mp3 at 64 kbps is
// ~1.4 MB for a 3-minute track and decodes in well under a second.
const ANALYSIS_FORMAT: StreamFormat = "mp3";
const ANALYSIS_MAX_BITRATE = 64;

/**
 * A cheap, deliberately low-quality copy of a track, used only to compute its
 * waveform envelope (see services/waveform/source.ts). Never played.
 *
 * Returns null when the track is already a local file (the caller reads it off
 * disk instead) — there is nothing to fetch and nothing to transcode.
 *
 * The extension matters: iOS's AVURLAsset infers a file's container from its
 * name, so the analysis temp file has to be saved with this suffix.
 */
export const analysisUrl = (
  id: string,
): { url: string; suffix: string } | null => {
  if (localFileUrl(id) != null) return null;
  if (isJellyfin()) {
    return {
      url: jellyfinOfflineStreamUrl(id, ANALYSIS_FORMAT, ANALYSIS_MAX_BITRATE),
      suffix: jellyfinOfflineTranscodeSuffix(ANALYSIS_FORMAT),
    };
  }
  const { url } = useAuthBase.getState();
  if (!url) return null;
  return {
    url: resolveServerBase(
      `${url}/rest/stream?id=${encodeURIComponent(id)}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}&f=json&format=${ANALYSIS_FORMAT}&maxBitRate=${ANALYSIS_MAX_BITRATE}`,
    ),
    suffix: ANALYSIS_FORMAT,
  };
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
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effectiveMaxBitRate = getEffectiveMaxBitRate(
    maxBitRate,
    cellularMaxBitRate,
  );
  const streamingFormat = activeStreamingFormat();
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
// The fields the cache helpers below and `isOfflineUndecodable` actually read.
// Loose enough to accept a `QueueTrack` (whose metadata rides an index
// signature) as well as a `Child`, so the prefetcher doesn't have to cast.
export type CacheableTrack = Pick<
  Child,
  "id" | "suffix" | "contentType" | "bitRate" | "duration" | "size"
>;

function isOfflineUndecodable(track: CacheableTrack): boolean {
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

/**
 * Where the prefetch cache (issue #163) gets a track's bytes.
 *
 * Unlike `offlineFileInfo`, this follows the *streaming* settings, so a cached
 * copy is what the wire would have delivered on this network: prefetching on
 * cellular inherits the cellular codec/bitrate (#162) and is therefore cheap by
 * construction, while a Wi-Fi prefetch keeps the original.
 *
 * Returns null for anything that must never be cached — local files and
 * self-hosted podcast enclosures already play off a URL of their own, and
 * without an active server there is nothing to fetch.
 *
 * No suffix is returned, deliberately. With a "raw" preference and a bitrate cap
 * the server may downsample to a format it never names up front (Navidrome's
 * DefaultDownsamplingFormat), so the container can't be predicted here. The
 * caller downloads into a *directory* instead and lets expo-file-system name the
 * file from the response — `URLUtil.guessFileName(url, contentDisposition,
 * contentType)` on Android, `httpResponse.suggestedFilename` on iOS — which
 * matters because AVURLAsset infers a file's container from its name.
 */
export const cacheFetchUrl = (track: CacheableTrack): string | null => {
  if (localFileUrl(track.id) != null) return null;
  if (!useAuthBase.getState().url) return null;

  const format = activeStreamingFormat();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effectiveMaxBitRate = getEffectiveMaxBitRate(
    maxBitRate,
    cellularMaxBitRate,
  );

  // A codec this device can't decode off disk has no way back once cached: the
  // player's decode-error fallback re-streams through a server transcode, which
  // is exactly what an unreachable server makes impossible. Force the transcode
  // now, same as the download path does (OFFLINE_UNDECODABLE_FALLBACK_FORMAT).
  if (isOfflineUndecodable(track)) {
    return streamUrl(track.id, { forceTranscode: true });
  }

  // Raw with no cap is the one case the stream endpoint adds nothing to: ask for
  // the original file directly so the cached copy is byte-exact.
  if (format === "raw" && !effectiveMaxBitRate) return downloadUrl(track.id);

  return streamUrl(track.id);
};

// What a track is assumed to cost when nothing better is known: no duration, no
// bitrate, no server-reported size. Deliberately pessimistic — the estimate
// gates admission to a fixed disk budget, so guessing high wastes a slot while
// guessing low overshoots the cap the user set.
const CACHE_FALLBACK_ESTIMATE_BYTES = 12 * 1024 * 1024;

/**
 * Roughly how many bytes `cacheFetchUrl` would pull for this track.
 *
 * Used for admission control against the cache's disk budget, which has to be
 * decided *before* the download starts — a HEAD would not help (against
 * Navidrome's /rest/stream it runs the whole ffmpeg transcode to answer and
 * still returns no Content-Length; see services/waveform/source.ts).
 */
export const cacheEstimatedBytes = (track: CacheableTrack): number => {
  const format = activeStreamingFormat();
  const { maxBitRate, cellularMaxBitRate } = useAppBase.getState();
  const effectiveMaxBitRate = getEffectiveMaxBitRate(
    maxBitRate,
    cellularMaxBitRate,
  );

  // The one exact case: an untouched original, whose size the server reports.
  if (
    format === "raw" &&
    !effectiveMaxBitRate &&
    !isOfflineUndecodable(track) &&
    typeof track.size === "number" &&
    track.size > 0
  ) {
    return track.size;
  }

  // Otherwise the server re-encodes, so the source size says nothing. kbps →
  // bytes/second is /8*1000, i.e. *125.
  const kbps = effectiveMaxBitRate ?? track.bitRate;
  if (track.duration && track.duration > 0 && kbps && kbps > 0) {
    return Math.round(track.duration * kbps * 125);
  }
  return CACHE_FALLBACK_ESTIMATE_BYTES;
};

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
