/**
 * What this device has failed to decode, and what the player did about it.
 *
 * Lives outside services/player.ts so the prefetch cache can consult it without
 * importing the audio engine (whose module body wires listeners, subscriptions
 * and hydration hooks). Three call sites have to agree on these ids —
 * `resolveTrackUrl` skips the on-disk copy, `isPlayableNow` must not count it,
 * and the prefetcher must not spend budget re-fetching it — and they only can if
 * the state isn't private to one of them.
 *
 * Runtime-only, deliberately: a decode failure is a property of this device and
 * this file, and both are re-derived on the next launch (the download path
 * transcodes undecodable codecs, and a cache entry evicted on the failure comes
 * back through a fresh fetch).
 */

// Ids whose raw stream failed to decode and have since been re-armed to stream
// through a forced server transcode. Bounded by the queue, and one retry per
// track keeps a genuinely broken source from looping.
const transcodeRetriedIds = new Set<string>();

// Ids whose *on-disk* copy failed to decode (e.g. an ALAC file saved before the
// download path learned to transcode it, or a prefetched copy of the same) and
// have since been forced to stream through a server transcode instead of playing
// off disk. Only meaningful while online; the download itself is corrected
// separately (offlineFileInfo transcodes such codecs), so this just bridges
// already-downloaded raw files.
const streamOverOfflineIds = new Set<string>();

export function noteTranscodeRetried(trackId: string): void {
  transcodeRetriedIds.add(trackId);
}

export function hasTranscodeRetried(trackId: string): boolean {
  return transcodeRetriedIds.has(trackId);
}

export function noteStreamOverOffline(trackId: string): void {
  streamOverOfflineIds.add(trackId);
}

/** Whether this track must come from the server even when a local copy exists. */
export function mustStreamOverOffline(trackId: string): boolean {
  return streamOverOfflineIds.has(trackId);
}

/** Test seam. */
export function __resetDecodeFallbacks(): void {
  transcodeRetriedIds.clear();
  streamOverOfflineIds.clear();
}
