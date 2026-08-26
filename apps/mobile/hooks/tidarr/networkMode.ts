// Tidarr runs on its own host, unrelated to the music server that drives
// react-query's onlineManager (device online AND active server reachable).
// Without this, a music server that is merely unreachable pauses every Tidarr
// query — and a paused query reports `isLoading: false` with no data, so the
// screens would render empty states for data that was never fetched.
export const TIDARR_NETWORK_MODE = "always" as const;
