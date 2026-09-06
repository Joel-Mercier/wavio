import type { LastFmParams } from "@/services/lastFm/signature";
import {
  isScrobblableTrack,
  type ScrobblableTrack,
} from "@/services/scrobbling/eligibility";
import type { QueuedScrobble } from "@/stores/lastFm";
import type { QueueTrack } from "@/stores/queue";

/**
 * Narrows a queue track down to the fields the Last.fm queue persists. Returns
 * null when the track isn't submittable, so callers have one check.
 *
 * `chosenByUser` is derived from the `autoQueued` marker endless radio puts on
 * the tracks it appends (services/endlessRadio.ts): 0 for a track the app
 * picked, 1 for one the listener chose. Last.fm weights recommendations with it
 * and defaults it to 1, so getting it wrong quietly skews their profile.
 */
export function toQueuedScrobble(
  track: QueueTrack,
  timestamp: number,
): Omit<QueuedScrobble, "id" | "retryCount"> | null {
  if (!isScrobblableTrack(track)) return null;
  const candidate = track as ScrobblableTrack & { autoQueued?: boolean };
  const chosenByUser: 0 | 1 = candidate.autoQueued ? 0 : 1;
  return {
    timestamp,
    track: {
      artist: (track.artist ?? "").trim(),
      track: (track.title ?? "").trim(),
      album: track.album?.trim() || undefined,
      // Only worth sending when it actually differs from the track artist —
      // the API asks for it on that basis, and a duplicate is noise in the
      // signature of every batch.
      albumArtist:
        typeof candidate.albumArtist === "string" &&
        candidate.albumArtist.trim() &&
        candidate.albumArtist.trim() !== (track.artist ?? "").trim()
          ? candidate.albumArtist.trim()
          : undefined,
      // OpenSubsonic's Child.musicBrainzId on a song is the recording MBID.
      // Last.fm asks for a "track" mbid and matches loosely, so sending it can
      // only help its matcher.
      mbid: candidate.musicBrainzId || undefined,
      duration:
        typeof track.duration === "number" && track.duration > 0
          ? Math.round(track.duration)
          : undefined,
      trackNumber:
        typeof candidate.track === "number"
          ? String(candidate.track)
          : undefined,
      chosenByUser,
    },
  };
}

/**
 * One scrobble's worth of `track.scrobble` parameters.
 *
 * `index` is null for a single scrobble, where the docs allow the `[i]` suffix
 * to be dropped entirely. Every optional field is omitted rather than sent
 * empty: an empty value still has to be signed, and Last.fm's matcher treats it
 * worse than an absent one.
 */
export function toScrobbleParams(
  scrobble: Pick<QueuedScrobble, "timestamp" | "track">,
  index: number | null,
): LastFmParams {
  const at = index === null ? "" : `[${index}]`;
  const { track } = scrobble;
  return {
    [`artist${at}`]: track.artist,
    [`track${at}`]: track.track,
    [`timestamp${at}`]: scrobble.timestamp,
    [`album${at}`]: track.album,
    [`albumArtist${at}`]: track.albumArtist,
    [`mbid${at}`]: track.mbid,
    [`duration${at}`]: track.duration,
    [`trackNumber${at}`]: track.trackNumber,
    [`chosenByUser${at}`]: track.chosenByUser,
  };
}

/**
 * `track.updateNowPlaying` parameters. No timestamp and no array notation — the
 * method describes exactly one track, right now.
 */
export function toNowPlayingParams(
  scrobble: Pick<QueuedScrobble, "track">,
): LastFmParams {
  const { track } = scrobble;
  return {
    artist: track.artist,
    track: track.track,
    album: track.album,
    albumArtist: track.albumArtist,
    mbid: track.mbid,
    duration: track.duration,
    trackNumber: track.trackNumber,
  };
}
