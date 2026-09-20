import { getEffectiveStreamingFormat } from "@/services/network";
import { useAppBase } from "@/stores/app";
import type { QueueTrack } from "@/stores/queue";

const MIME_BY_SUFFIX: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/mp4",
  alac: "audio/mp4",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  ape: "audio/x-monkeys-audio",
  wv: "audio/x-wavpack",
};

/**
 * The MIME type to declare for a track handed to a renderer or a Cast receiver.
 *
 * A receiver decides whether it can play something from what it is told, and our
 * stream URLs carry no file extension to guess from. What actually arrives is the
 * transcode target when one is configured, and the source file's own format
 * otherwise — not the source format in both cases, which is the mistake that makes
 * a speaker refuse a track the server was about to send it as MP3. The target has
 * to be resolved for the current network, like the stream URL itself is, or a
 * cellular-only format is streamed while the receiver is told the Wi-Fi one.
 *
 * Anything unrecognised is still audio, and saying so beats letting it be guessed.
 */
export function castMime(track: QueueTrack): string {
  const { streamingFormat, cellularStreamingFormat } = useAppBase.getState();
  const effective = getEffectiveStreamingFormat(
    streamingFormat,
    cellularStreamingFormat,
  );
  const format =
    effective && effective !== "raw"
      ? effective
      : (track.suffix as string | undefined);
  return MIME_BY_SUFFIX[(format ?? "").toLowerCase()] ?? "audio/mpeg";
}
