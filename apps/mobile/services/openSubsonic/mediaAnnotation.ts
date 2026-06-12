import { subsonicRequest } from "@/services/openSubsonic/index";

export const scrobble = async (
  id: string,
  { time, submission }: { time?: number; submission?: boolean },
) =>
  subsonicRequest<Record<string, never>>("/rest/scrobble", {
    id,
    time,
    submission,
  });

// OpenSubsonic `playbackReport` extension (Navidrome v0.62.0). Reports playback
// state/position so the server drives scrobbling and enriches getNowPlaying.
export type PlaybackReportState = "starting" | "playing" | "paused" | "stopped";

export const reportPlayback = async ({
  mediaId,
  mediaType = "song",
  positionMs,
  state,
  playbackRate,
  ignoreScrobble,
}: {
  mediaId: string;
  // Required by Navidrome's handler — a missing mediaType makes every call fail
  // (the request still 200s at the HTTP layer but returns a Subsonic error and
  // nothing is recorded). The player only reports songs (podcasts are excluded).
  mediaType?: "song" | "podcast";
  positionMs: number;
  state: PlaybackReportState;
  playbackRate?: number;
  ignoreScrobble?: boolean;
}) =>
  subsonicRequest<Record<string, never>>("/rest/reportPlayback", {
    mediaId,
    mediaType,
    positionMs,
    state,
    playbackRate,
    ignoreScrobble,
  });

export const setRating = async (id: string, rating: number) =>
  subsonicRequest<Record<string, never>>("/rest/setRating", { id, rating });

export const star = async ({
  id,
  albumId,
  artistId,
}: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) =>
  subsonicRequest<Record<string, never>>("/rest/star", {
    id,
    albumId,
    artistId,
  });

export const unstar = async ({
  id,
  albumId,
  artistId,
}: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) =>
  subsonicRequest<Record<string, never>>("/rest/unstar", {
    id,
    albumId,
    artistId,
  });
