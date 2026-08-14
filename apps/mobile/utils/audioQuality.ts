import type { StreamFormat } from "@/stores/app";
import type { QueueTrack } from "@/stores/queue";

export function formatSampleRate(hz: number): string {
  const khz = hz / 1000;
  return Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
}

function sourceFormat(track: QueueTrack): string | undefined {
  return (
    track.suffix ||
    (typeof track.contentType === "string"
      ? track.contentType.split("/").pop()
      : undefined)
  );
}

// Builds a short source-quality label (e.g. "FLAC · 1016 kbps · 44.1 kHz") from
// whatever fields the active backend populated. Reflects the source file, not
// the streamed/transcoded output. Returns null for radio/podcast or when no
// quality data is available.
export function formatAudioQuality(track: QueueTrack | null): string | null {
  if (!track || track.isRadio || track.source === "podcast") return null;

  const parts: string[] = [];
  const format = sourceFormat(track);
  if (format) parts.push(String(format).toUpperCase());
  if (typeof track.bitRate === "number" && track.bitRate > 0)
    parts.push(`${track.bitRate} kbps`);
  if (typeof track.samplingRate === "number" && track.samplingRate > 0)
    parts.push(`${formatSampleRate(track.samplingRate)} kHz`);

  return parts.length ? parts.join(" · ") : null;
}

// Compact "FORMAT · N kbps" label (no sample rate) for the transcode from/to
// endpoints. Either segment is omitted when unknown.
function compactQuality(
  format: string | undefined,
  bitRate: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (format) parts.push(format.toUpperCase());
  if (typeof bitRate === "number" && bitRate > 0) parts.push(`${bitRate} kbps`);
  return parts.length ? parts.join(" · ") : null;
}

export interface TranscodeInfo {
  active: boolean;
  fromLabel: string | null;
  toLabel: string | null;
}

// Predicts whether the active streaming settings cause the server to transcode
// this track, and what the streamed output looks like. Mirrors the URL params
// built in services/backend/streaming.ts (Subsonic) and services/jellyfin/
// streaming.ts (Jellyfin): a non-"raw" format asks the server to transcode to
// that codec, and an effective bitrate cap downsamples only when the source
// bitrate exceeds it. `rawTranscodeFormat` is the codec a format- or
// bitrate-forced transcode lands on while the format is "raw" (Jellyfin →
// "aac"); omit it when the server picks the codec itself. `formatTranscode`
// overrides the default suffix-vs-format comparison for backends whose
// negotiation isn't format-based (Jellyfin's container accept-lists).
export function getTranscodeInfo(
  track: QueueTrack | null,
  {
    streamingFormat,
    effectiveMaxBitRate,
    rawTranscodeFormat,
    formatTranscode: formatTranscodeOverride,
  }: {
    streamingFormat: StreamFormat;
    effectiveMaxBitRate: number | null;
    rawTranscodeFormat?: string;
    formatTranscode?: boolean;
  },
): TranscodeInfo {
  if (!track || track.isRadio || track.source === "podcast") {
    return { active: false, fromLabel: null, toLabel: null };
  }

  const format = sourceFormat(track);
  const normalizedFormat = format ? format.toLowerCase() : undefined;
  const sourceBitRate =
    typeof track.bitRate === "number" && track.bitRate > 0
      ? track.bitRate
      : null;

  const formatTranscode =
    formatTranscodeOverride ??
    (streamingFormat !== "raw" && streamingFormat !== normalizedFormat);
  const bitrateTranscode =
    effectiveMaxBitRate != null &&
    sourceBitRate != null &&
    sourceBitRate > effectiveMaxBitRate;
  const active = formatTranscode || bitrateTranscode;

  if (!active) {
    return { active: false, fromLabel: null, toLabel: null };
  }

  // A concrete format is the target whatever forced the transcode: the requested
  // codec goes out on every stream URL (Subsonic `format=`, Jellyfin
  // `AudioCodec=`), so a cap-driven transcode of an already-matching source still
  // comes back in that codec. Only a raw-mode transcode (bitrate-forced, or a
  // container the backend can't direct-play) has no target codec in
  // `streamingFormat`; it lands on `rawTranscodeFormat`. Backends that leave the
  // choice to the server — Subsonic downsamples to its own
  // DefaultDownsamplingFormat, which the client can't read — pass none, and the
  // codec segment is dropped rather than wrongly echoing the source one back.
  const targetFormat =
    streamingFormat !== "raw" ? streamingFormat : rawTranscodeFormat;
  // The streamed bitrate is only known when the cap drives the transcode; a
  // format-only change transcodes at the server's default bitrate (unknown), so
  // the segment is omitted.
  const targetBitRate = bitrateTranscode ? effectiveMaxBitRate : null;

  return {
    active: true,
    fromLabel: compactQuality(format, sourceBitRate),
    toLabel: compactQuality(targetFormat, targetBitRate),
  };
}
