import * as Application from "expo-application";
import type {
  Listen,
  ListenAdditionalInfo,
  ListenTrackMetadata,
} from "@/services/listenBrainz/types";
import {
  isScrobblableTrack,
  type ScrobblableTrack,
} from "@/services/scrobbling/eligibility";
import type { QueuedListen } from "@/stores/listenBrainz";
import type { QueueTrack } from "@/stores/queue";

const CLIENT_NAME = "Wavio";

// The rule is identical on Last.fm, so it lives in services/scrobbling. Kept
// exported under the old name because the tests and existing call sites use it.
export { isScrobblableTrack as isSubmittableToListenBrainz } from "@/services/scrobbling/eligibility";

/**
 * Narrows a queue track down to the fields the ListenBrainz queue persists.
 * Returns null when the track isn't submittable, so callers have one check.
 */
export function toQueuedListen(
  track: QueueTrack,
  listenedAt: number,
): Omit<QueuedListen, "id" | "retryCount"> | null {
  if (!isScrobblableTrack(track)) return null;
  const candidate = track as ScrobblableTrack;
  return {
    listenedAt,
    track: {
      trackName: (track.title ?? "").trim(),
      artistName: (track.artist ?? "").trim(),
      releaseName: track.album?.trim() || undefined,
      // OpenSubsonic's Child.musicBrainzId on a song is the *recording* MBID,
      // which is exactly what ListenBrainz wants to skip its own fuzzy matching.
      recordingMbid: candidate.musicBrainzId || undefined,
      durationMs:
        typeof track.duration === "number" && track.duration > 0
          ? Math.round(track.duration * 1000)
          : undefined,
      trackNumber:
        typeof candidate.track === "number"
          ? String(candidate.track)
          : undefined,
    },
  };
}

/**
 * Builds the wire payload. Every field ListenBrainz treats as optional is
 * omitted entirely rather than sent empty — the API asks for that explicitly,
 * and an empty string is worse than an absent field for its matcher.
 *
 * `listenedAt` is omitted for a "playing_now" submission, which the API rejects
 * if it carries a timestamp.
 */
export function toListen(
  queued: Omit<QueuedListen, "id" | "retryCount">,
  options: { includeTimestamp: boolean },
): Listen {
  const { track } = queued;
  const additionalInfo: ListenAdditionalInfo = {
    media_player: CLIENT_NAME,
    submission_client: CLIENT_NAME,
    submission_client_version:
      Application.nativeApplicationVersion ?? undefined,
  };
  if (track.recordingMbid) additionalInfo.recording_mbid = track.recordingMbid;
  if (track.releaseMbid) additionalInfo.release_mbid = track.releaseMbid;
  if (track.artistMbids?.length)
    additionalInfo.artist_mbids = track.artistMbids;
  if (track.durationMs) additionalInfo.duration_ms = track.durationMs;
  if (track.trackNumber) additionalInfo.tracknumber = track.trackNumber;

  const metadata: ListenTrackMetadata = {
    artist_name: track.artistName,
    track_name: track.trackName,
    additional_info: additionalInfo,
  };
  if (track.releaseName) metadata.release_name = track.releaseName;

  return options.includeTimestamp
    ? { listened_at: queued.listenedAt, track_metadata: metadata }
    : { track_metadata: metadata };
}
