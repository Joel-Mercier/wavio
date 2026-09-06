import { callSigned } from "@/services/lastFm/client";
import { toCount, toEntries } from "@/services/lastFm/json";
import type { LastFmParams } from "@/services/lastFm/signature";

// A batch request may carry at most 50 scrobbles [0<=i<=49].
// https://www.last.fm/api/show/track.scrobble
export const MAX_SCROBBLES_PER_REQUEST = 50;

// Per-scrobble filtering codes. These arrive inside a `status: "ok"` response —
// the request succeeded, Last.fm just declined to record some of it — so they
// are never errors and must never be retried.
// https://www.last.fm/api/show/track.scrobble
export const IGNORED = {
  ACCEPTED: 0,
  ARTIST_IGNORED: 1,
  TRACK_IGNORED: 2,
  TIMESTAMP_TOO_OLD: 3,
  TIMESTAMP_TOO_NEW: 4,
  DAILY_LIMIT_EXCEEDED: 5,
} as const;

type ScrobbleEntry = {
  ignoredMessage?: { code?: string; "#text"?: string };
};

type ScrobbleResponse = {
  scrobbles?: {
    "@attr"?: { accepted?: string | number; ignored?: string | number };
    // Object for one scrobble, array for two or more — see json.ts.
    scrobble?: ScrobbleEntry | ScrobbleEntry[];
  };
};

export type ScrobbleOutcome = {
  accepted: number;
  ignored: number;
  /** The `ignoredMessage` codes Last.fm reported, for diagnostics. */
  ignoredCodes: number[];
};

export const submitScrobbles = async (
  params: LastFmParams,
): Promise<ScrobbleOutcome> => {
  const rsp = await callSigned<ScrobbleResponse>("track.scrobble", params);
  const entries = toEntries(rsp.scrobbles?.scrobble);
  const ignoredCodes = entries
    .map((entry) => Number(entry?.ignoredMessage?.code ?? 0))
    .filter((code) => code !== IGNORED.ACCEPTED);
  return {
    accepted: toCount(
      rsp.scrobbles?.["@attr"]?.accepted,
      entries.length - ignoredCodes.length,
    ),
    ignored: toCount(rsp.scrobbles?.["@attr"]?.ignored, ignoredCodes.length),
    ignoredCodes,
  };
};

/**
 * Fire-and-forget "this is playing right now". Purely cosmetic on the Last.fm
 * profile: it expires on their side after roughly the track's duration, so it is
 * never queued — by the time a device is back online the track it described has
 * long stopped playing.
 */
export const updateNowPlaying = async (params: LastFmParams): Promise<void> => {
  await callSigned("track.updateNowPlaying", params);
};

export const loveTrack = async (
  artist: string,
  track: string,
  loved: boolean,
): Promise<void> => {
  await callSigned(loved ? "track.love" : "track.unlove", { artist, track });
};
