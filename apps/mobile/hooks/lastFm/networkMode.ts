// Last.fm is the listener's own account on a third-party host, unrelated to the
// music server that drives react-query's onlineManager (device online AND active
// server reachable). Without this, a Navidrome that is merely unreachable — or a
// local library, which has no server at all — pauses every Last.fm query, and a
// paused query reports `isLoading: false` with no data, so the screen would
// render an empty state for something it never asked for.
export const LASTFM_NETWORK_MODE = "always" as const;
