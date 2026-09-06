import type { QueueTrack } from "@/stores/queue";

// Last.fm and ListenBrainz agree on the rule, to the second: a track counts once
// the listener has heard half of it, or four minutes, whichever comes first, and
// never if it is shorter than thirty seconds.
// https://www.last.fm/api/scrobbling
// https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
//
// This lives at the root of `services/` rather than under either provider so the
// two can't drift apart: a change here has to be a deliberate change to both.
const MAX_SUBMIT_THRESHOLD_SECONDS = 240;
const MIN_TRACK_DURATION_SECONDS = 30;

/**
 * The position, in seconds, at which a track of this duration becomes a
 * submittable play. Exported for the player and for tests.
 */
export function submissionThresholdSeconds(duration: number): number {
  return Math.min(duration / 2, MAX_SUBMIT_THRESHOLD_SECONDS);
}

export function isSubmittableDuration(duration: number): boolean {
  return duration >= MIN_TRACK_DURATION_SECONDS;
}

// What childToTrack (utils/childToTrack.ts) puts on a queue track, plus the
// radio/podcast markers the submission gate reads. QueueTrack itself is an open
// record, so this narrows it to the fields that matter here.
export type ScrobblableTrack = QueueTrack & {
  musicBrainzId?: string;
  track?: number;
  isRadio?: boolean;
  isUntitled?: boolean;
  source?: string;
};

/**
 * Whether a track can be honestly described to a scrobbling service.
 *
 * Podcasts aren't music. Internet radio is excluded because the queue entry
 * describes the *station*, not whatever it happens to be playing, so submitting
 * it would file hours of listening under a single fake "track". And
 * `childToTrack` substitutes an empty artist and a localised "Unknown" title for
 * untagged files — submitting those would write junk into a listening history
 * that is meant to last, so they're skipped rather than guessed at. The title
 * check reads `isUntitled` rather than the title itself, because the substituted
 * placeholder is a perfectly non-empty string.
 */
export function isScrobblableTrack(track: QueueTrack): boolean {
  const candidate = track as ScrobblableTrack;
  if (candidate.source === "podcast") return false;
  if (candidate.isRadio) return false;
  if (candidate.isUntitled) return false;
  return Boolean(track.title?.trim()) && Boolean(track.artist?.trim());
}
