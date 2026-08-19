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

const INACTIVE: TranscodeInfo = {
  active: false,
  fromLabel: null,
  toLabel: null,
};

// Extensions the same untouched audio can arrive under, so a byte-exact copy the
// server happened to name differently isn't reported as a transcode. `opus` is
// deliberately not folded into `ogg`: a vorbis source re-encoded to opus is a
// real transcode even when both end up in an Ogg container.
const CONTAINER_ALIASES: Record<string, string> = {
  m4a: "mp4",
  m4b: "mp4",
  mp4: "mp4",
  alac: "mp4",
  oga: "ogg",
};

const normalizeContainer = (format: string | undefined): string | undefined => {
  if (!format) return undefined;
  const lower = format.toLowerCase();
  return CONTAINER_ALIASES[lower] ?? lower;
};

// How far under the source bitrate the cached file must measure before it counts
// as downsampled. Container overhead and VBR mean a byte-exact copy rarely
// measures exactly the reported bitrate; a real cap (320 → 128) is nowhere near
// this line.
const CACHED_BITRATE_TOLERANCE = 0.9;

// The bitrates a transcode actually lands on: the app's own cap options plus the
// classic MP3/AAC ladder.
const BITRATE_LADDER = [32, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
// Container headers, tags and embedded cover art all count toward the file's
// bytes, and its duration divides in whole seconds, so a 320 kbps encode
// measures a few kbps high — by a different amount on every track. Snap back
// onto the rung the encoder was aimed at instead of reading 321 on one track and
// 322 on the next. Deliberately tight: a genuine VBR average (245 kbps) is
// nowhere near a rung and stays exactly as measured.
const LADDER_SNAP_TOLERANCE = 0.025;

const snapToLadder = (kbps: number | null): number | null => {
  if (kbps == null) return null;
  const rung = BITRATE_LADDER.find(
    (value) => Math.abs(kbps - value) <= value * LADDER_SNAP_TOLERANCE,
  );
  return rung ?? kbps;
};

export interface LocalFileTranscodeInfo extends TranscodeInfo {
  // Whether the comparison had evidence on both sides. Without it, an inactive
  // result means "nothing to compare", not "bit-exact", so the caller must not
  // badge the track as ORIGINAL.
  comparable: boolean;
}

const NOT_COMPARABLE: LocalFileTranscodeInfo = {
  ...INACTIVE,
  comparable: false,
};

/**
 * The transcode a copy *on disk* actually went through — a prefetched track or
 * an offline download — read off the file instead of predicted from the current
 * settings.
 *
 * `getTranscodeInfo` answers "what would streaming this now do?", which is the
 * wrong question for both: the fetch already happened. A prefetch may have run
 * on another network under a different format and cap (the whole point of the
 * per-network streaming settings), and a download was written in whatever
 * `downloadFormat` asked for (see offlineFileInfo). The file's own container and
 * size are the only record of what was really fetched — a copy pulled on
 * cellular genuinely is 128 kbps opus, and saying "ORIGINAL" over it is a lie
 * about the audio the user is hearing.
 *
 * `source` overrides what the track claims to be, for the case where the queue
 * entry was itself built from the downloaded file (offlineTrackToChild) and so
 * already describes the copy rather than the original.
 */
export function localFileTranscodeInfo(
  track: QueueTrack | null,
  entry: { suffix: string | undefined; bytes: number } | null,
  source?: { suffix?: string; bitRate?: number },
): LocalFileTranscodeInfo {
  if (!track || !entry || track.isRadio || track.source === "podcast") {
    return NOT_COMPARABLE;
  }

  const format = source?.suffix || sourceFormat(track);
  const cachedFormat = entry.suffix || undefined;
  const sourceBitRateRaw = source?.bitRate ?? track.bitRate;
  const sourceBitRate =
    typeof sourceBitRateRaw === "number" && sourceBitRateRaw > 0
      ? sourceBitRateRaw
      : null;
  // The average bitrate of what is actually on disk. Only meaningful with a
  // duration to divide by, which radio-less library tracks always have.
  const cachedBitRate = snapToLadder(
    typeof track.duration === "number" && track.duration > 0 && entry.bytes > 0
      ? Math.round((entry.bytes * 8) / track.duration / 1000)
      : null,
  );

  const formatChanged =
    normalizeContainer(cachedFormat) != null &&
    normalizeContainer(format) != null &&
    normalizeContainer(cachedFormat) !== normalizeContainer(format);
  const downsampled =
    sourceBitRate != null &&
    cachedBitRate != null &&
    cachedBitRate < sourceBitRate * CACHED_BITRATE_TOLERANCE;

  // What makes "no transcode detected" mean "bit-exact" rather than "nothing to
  // compare". Bitrates measure up on their own, but a matching *format* only
  // counts when the source one was recorded separately: a queue entry built from
  // the downloaded file (offlineTrackToChild) always agrees with itself, which
  // is a tautology, not evidence.
  const comparable =
    (sourceBitRate != null && cachedBitRate != null) ||
    (source?.suffix != null && cachedFormat != null);

  if (!formatChanged && !downsampled) return { ...INACTIVE, comparable };

  return {
    active: true,
    comparable: true,
    fromLabel: compactQuality(format, sourceBitRate),
    // Measured (then snapped to its rung), not requested: this is the file, so
    // its own numbers are the honest ones to show.
    toLabel: compactQuality(cachedFormat ?? format, cachedBitRate),
  };
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
