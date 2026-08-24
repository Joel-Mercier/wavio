// ListenBrainz is the listener's own account on a third-party host, unrelated to
// the music server that drives react-query's onlineManager (device online AND
// active server reachable). Without this, a Navidrome that is merely unreachable
// — or a local library, which has no server at all — pauses every ListenBrainz
// query, and a paused query reports `isLoading: false` with no data, so the
// screen would render "nothing computed yet" for stats it never asked for.
export const LISTENBRAINZ_NETWORK_MODE = "always" as const;
