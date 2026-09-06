/** One entry from `user.getLovedTracks`. */
export type LastFmLovedTrack = {
  name: string;
  artist: string;
  /**
   * Last.fm's `mbid` for a track entity is the recording MBID, which is what
   * Child.musicBrainzId holds on every backend that fills it in. Often absent,
   * and only ever used to *confirm* a candidate a text search already returned
   * (see services/libraryMatch.ts), so an unreliable one costs nothing.
   */
  mbid?: string;
  /** Unix seconds, when the user loved it. */
  lovedAt?: number;
  url?: string;
};

export type LastFmPage<T> = {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
};

/**
 * The four periods the screen offers, out of the API's seven. They line up with
 * the four ranges ListenBrainz's stats screen exposes, so the two read the same.
 */
export type LastFmPeriod = "7day" | "1month" | "12month" | "overall";

export type LastFmUserInfo = {
  name: string;
  playCount: number;
  artistCount: number;
  albumCount: number;
  trackCount: number;
  /** Unix seconds, or null when the profile doesn't say. */
  registeredAt: number | null;
  url?: string;
};

export type LastFmRecentTrack = {
  key: string;
  name: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  loved: boolean;
  /** True for the one entry describing what is playing right now. */
  nowPlaying: boolean;
  /** Unix seconds; null while `nowPlaying`, which carries no timestamp. */
  playedAt: number | null;
};
