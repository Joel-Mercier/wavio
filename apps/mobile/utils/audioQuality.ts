import type { QueueTrack } from "@/stores/queue";

function formatSampleRate(hz: number): string {
  const khz = hz / 1000;
  return Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
}

// Builds a short source-quality label (e.g. "FLAC · 1016 kbps · 44.1 kHz") from
// whatever fields the active backend populated. Reflects the source file, not
// the streamed/transcoded output. Returns null for radio/podcast or when no
// quality data is available.
export function formatAudioQuality(track: QueueTrack | null): string | null {
  if (!track || track.isRadio || track.source === "podcast") return null;

  const parts: string[] = [];
  const format =
    track.suffix ||
    (typeof track.contentType === "string"
      ? track.contentType.split("/").pop()
      : undefined);
  if (format) parts.push(String(format).toUpperCase());
  if (typeof track.bitRate === "number" && track.bitRate > 0)
    parts.push(`${track.bitRate} kbps`);
  if (typeof track.samplingRate === "number" && track.samplingRate > 0)
    parts.push(`${formatSampleRate(track.samplingRate)} kHz`);

  return parts.length ? parts.join(" · ") : null;
}
