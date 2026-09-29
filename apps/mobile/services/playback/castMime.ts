import { parseLocalPodcastEpisodeId } from "@/services/local/keys";
import { getEffectiveStreamingFormat } from "@/services/network";
import { isPodcastTrack } from "@/services/podcastProgress";
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

const MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
};

// Internet radio, Taddy enclosures and self-hosted feed episodes are fetched
// from wherever they are hosted, so the server's transcoding never touches them.
function hostedElsewhere(track: QueueTrack): boolean {
  if (track.isRadio) return true;
  if (!isPodcastTrack(track)) return false;
  if (track.podcastSource === "taddy" || typeof track.audioUrl === "string") {
    return true;
  }
  return parseLocalPodcastEpisodeId(track.streamId ?? track.id) != null;
}

function urlSuffix(url: string | undefined): string | undefined {
  return url?.split(/[?#]/)[0].match(/\.([a-z0-9]{1,5})$/i)?.[1];
}

// A feed's enclosure type is the best description of an episode there is; the
// file extension is the fallback, since Taddy hands over no type at all.
function episodeMime(track: QueueTrack, url: string | undefined) {
  const declared =
    typeof track.contentType === "string"
      ? track.contentType.toLowerCase()
      : "";
  if (declared.startsWith("audio/")) return MIME_ALIASES[declared] ?? declared;
  return MIME_BY_SUFFIX[(urlSuffix(url) ?? "").toLowerCase()];
}

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
 * None of that applies to a stream the server never serves.
 *
 * Anything unrecognised is still audio, and saying so beats letting it be guessed.
 */
export function castMime(track: QueueTrack, url?: string): string {
  if (hostedElsewhere(track)) {
    const mime = isPodcastTrack(track) ? episodeMime(track, url) : undefined;
    return mime ?? "audio/mpeg";
  }
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
