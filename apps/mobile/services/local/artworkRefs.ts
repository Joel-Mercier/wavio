import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";

/**
 * Artwork filenames held by persisted state outside the SQLite index.
 *
 * `mapRowToChild` hands a local track's artwork path out as `Child.coverArt`,
 * and from there it is stored verbatim in MMKV: the queue survives a restart,
 * and a recent-plays entry (which the home screen and the Android widget both
 * render) outlives the album it points at. Both stores are scoped per
 * (server, user) like `artworkDir` itself, so this is exactly the state that
 * can point into the directory `pruneArtwork` cleans — without it, deleting an
 * album from the device blanks its recent tile and the restored queue's cover.
 *
 * Its own module rather than a helper inside indexer.ts so the scanner doesn't
 * pull playback state (and MMKV with it) into every test that indexes.
 */
export function persistedArtworkNames(): Set<string> {
  const names = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || value.length === 0) return;
    const name = value.split("/").pop();
    if (name) names.add(name);
  };
  const queue = useQueue.getState();
  for (const track of queue.queue) {
    add(track.artwork);
    add(track.coverArt);
  }
  add(queue.source?.coverArt);
  for (const play of useRecentPlays.getState().recentPlays) add(play.coverArt);
  return names;
}
