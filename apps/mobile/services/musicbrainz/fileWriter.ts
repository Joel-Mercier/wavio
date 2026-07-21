import { isAudioTaggerAvailable, writeTags } from "@/modules/audio-tagger";
import { reportError } from "@/services/errorReporting";
import type { TrackOverrideInput } from "@/services/local/tagOverrides";

// Writes corrections into the audio files themselves, as opposed to the in-app
// override layer (services/local/tagOverrides.ts).
//
// The native module lives in `modules/audio-tagger` and is Android-only: it
// takes a *file descriptor* rather than a path because the local library's
// source folders are Storage Access Framework tree URIs (`content://…`), which
// no path-based tagging API can open. See components/forms/LocalPathsField.tsx,
// where the persistable read+write grant is obtained.
export function isFileWritingAvailable(): boolean {
  return isAudioTaggerAvailable();
}

/** The tag fields handed to the native writer, in its own flat wire shape. */
export type FileTagPayload = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  musicBrainzRecordingId?: string;
  musicBrainzReleaseId?: string;
  // A local file path, not image bytes: the native side reads it directly,
  // which avoids base64-encoding a few hundred KB across the bridge per track.
  artworkPath?: string;
  artworkMimeType?: string;
};

// The Cover Art Archive front-cover endpoint serves JPEG (coverArt.ts saves it
// as .jpg), so this is a constant rather than something sniffed per file.
const COVER_MIME_TYPE = "image/jpeg";

export function toFileTagPayload(override: TrackOverrideInput): FileTagPayload {
  const payload: FileTagPayload = {};
  if (override.title) payload.title = override.title;
  if (override.artist) payload.artist = override.artist;
  if (override.album) payload.album = override.album;
  if (override.album_artist) payload.albumArtist = override.album_artist;
  if (override.year != null) payload.year = override.year;
  if (override.track_number != null) {
    payload.trackNumber = override.track_number;
  }
  if (override.disc_number != null) payload.discNumber = override.disc_number;
  if (override.mb_recording_id) {
    payload.musicBrainzRecordingId = override.mb_recording_id;
  }
  if (override.mb_release_id) {
    payload.musicBrainzReleaseId = override.mb_release_id;
  }
  if (override.artwork_path) {
    payload.artworkPath = override.artwork_path;
    payload.artworkMimeType = COVER_MIME_TYPE;
  }
  return payload;
}

/**
 * Attempts to write one track's corrections into its file.
 *
 * Returns whether the write happened. Failures are non-fatal by design: the
 * caller still persists the override, so a file that can't be written (read-only
 * media, an unsupported container) degrades to the in-app correction rather than
 * losing the match entirely.
 */
export async function writeTagsToFile(
  uri: string,
  override: TrackOverrideInput,
): Promise<boolean> {
  if (!isAudioTaggerAvailable()) return false;
  try {
    await writeTags(uri, toFileTagPayload(override));
    return true;
  } catch (error) {
    reportError(error, {
      area: "metadata",
      api: "musicbrainz",
      endpoint: "writeTagsToFile",
      extra: { suffix: uri.split(".").pop() },
    });
    return false;
  }
}
