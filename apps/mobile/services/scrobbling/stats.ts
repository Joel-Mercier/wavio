/**
 * The presentational shapes the scrobbling stats screens share.
 *
 * Like services/scrobbling/eligibility.ts, this sits at the root of `services/`
 * rather than under either provider so that ListenBrainz and Last.fm can't
 * drift into two incompatible descriptions of "a top-ten row" — the components
 * in components/scrobbling/ render both.
 */

/** One row of a top artists / albums / tracks list. */
export type TopStatItem = {
  key: string;
  rank: number;
  title: string;
  subtitle?: string;
  listenCount: number;
  artworkUrl?: string;
};

/**
 * A statistic that may not exist yet.
 *
 * ListenBrainz computes these in a batch job, and until it has run for a given
 * user *and* range the endpoint answers `204 No Content`. That is a routine
 * state, not a failure and not an empty result — a heavily-used account still
 * gets a 204 for `week` while `year` returns data — so it is modelled
 * explicitly rather than collapsed into `null`, which callers would inevitably
 * render as "no listens".
 *
 * Last.fm has no equivalent: it computes on read and always answers, so its
 * fetchers only ever produce `ready`. The union is still shared because the
 * sections that render both take one type.
 */
export type StatsResult<T> =
  | { state: "ready"; data: T; lastUpdated: number | null }
  | { state: "notComputed" };
