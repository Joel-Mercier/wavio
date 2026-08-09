import useActivity from "@/stores/activity";
import useBookmarks from "@/stores/bookmarks";
import useLibrarySync from "@/stores/librarySync";
import useLrclibPicks from "@/stores/lrclibPicks";
import useOffline from "@/stores/offline";
import useOfflineMutations from "@/stores/offlineMutations";
import usePlayHistory from "@/stores/playHistory";
import usePlaylists from "@/stores/playlists";
import useQueue from "@/stores/queue";
import useRadioStations from "@/stores/radioStations";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { isCanonicalIdStable } from "@/utils/navidromeCanonicalId";

// Trigger half of the canonical-id migration (navidrome/navidrome#5824).
//
// Kept free of any `services/` import on purpose: this runs inside the Subsonic
// response interceptor, and reaching for the probe (which issues Subsonic
// requests of its own) from there would be a cycle. The probe lives in ./index
// and is kicked reactively by LibrarySyncController when it sees "checking".
//
// Deliberately NOT version-gated. The migration ships in a release we can't name
// yet, and develop builds carry a git sha rather than a sequential version, so a
// semver threshold would skip exactly the users who hit it first. A *change* in
// the version string is only a hint that it's worth looking — the differential
// probe is the actual proof.

// Enough samples that a coincidence is implausible, few enough that the probe
// stays cheap (Subsonic spends one request per id, and we ask about two ids per
// sample).
export const MAX_SAMPLES = 6;

/**
 * Ids worth asking the server about: any persisted *song* id the transform
 * would actually change. An id that maps to itself resolves whether or not the
 * server migrated, so it proves nothing — and the probe asks getSong, so album
 * / artist / playlist ids would come back "gone" either way and are no evidence
 * at all.
 *
 * Covers every store that can hold a song id on its own, not just the ones the
 * reconcilers would damage: a scope whose only legacy ids sit in the offline
 * mutation queue still needs the remap, and finding no candidates here means no
 * remap ever runs.
 */
export function probeCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const consider = (id: string | undefined) => {
    if (!id || seen.has(id) || out.length >= MAX_SAMPLES) return;
    seen.add(id);
    if (isCanonicalIdStable(id)) return;
    out.push(id);
  };

  for (const id of Object.keys(useOffline.getState().downloadedTracks)) {
    consider(id);
  }
  for (const track of useQueue.getState().queue) {
    // Radio stations and podcast episodes carry uuids from Radio Browser /
    // Taddy, not the server; getSong knows nothing about either.
    if (track.isRadio || track.source === "podcast") continue;
    consider(track.id);
  }
  for (const entry of usePlayHistory.getState().history) consider(entry.id);
  for (const entry of useActivity.getState().activity) consider(entry.trackId);
  for (const order of Object.values(
    usePlaylists.getState().playlistTrackOrders,
  )) {
    for (const trackId of order) consider(trackId);
  }
  for (const mutation of useOfflineMutations.getState().queue) {
    const action = mutation.action;
    if (action.type === "star" && action.target.kind === "song") {
      consider(action.target.id);
    } else if (
      action.type === "playlistAddSongs" ||
      action.type === "playlistRemoveSongs"
    ) {
      for (const songId of action.songIds) consider(songId);
    }
  }
  return out;
}

/**
 * Whether this scope holds anything a migration would need to repair — every
 * store services/navidromeIdMigration/remap.ts rewrites, so the two stay in
 * lockstep. Answering "no" here records the new server version and gives up on
 * detection for good, so an omission is permanent.
 */
export function hasLocalData(): boolean {
  const offline = useOffline.getState();
  if (Object.keys(offline.downloadedTracks).length > 0) return true;
  if (Object.keys(offline.downloadedCollections).length > 0) return true;
  if (useQueue.getState().queue.length > 0) return true;
  if (usePlayHistory.getState().history.length > 0) return true;
  if (useActivity.getState().activity.length > 0) return true;
  if (useOfflineMutations.getState().queue.length > 0) return true;
  if (Object.keys(useBookmarks.getState().bookmarks).length > 0) return true;
  if (Object.keys(useLrclibPicks.getState().picks).length > 0) return true;
  const playlists = usePlaylists.getState();
  if (Object.keys(playlists.playlistTrackOrders).length > 0) return true;
  if (Object.keys(playlists.playlistSorts).length > 0) return true;
  // Entries the remap deliberately leaves alone don't count as data to repair —
  // notably the synthetic "favorites" shortcut, which is pinned into every
  // scope on hydration and would otherwise make a fresh install look populated.
  const remappableRecentPlay = useRecentPlays
    .getState()
    .recentPlays.some((entry) =>
      entry.type === "internetRadioStation"
        ? entry.source === "server"
        : entry.type !== "favorites",
    );
  if (remappableRecentPlay) return true;
  if (
    useRecentSearches
      .getState()
      .recentSearches.some((entry) => entry.type !== "query")
  ) {
    return true;
  }
  return useRadioStations
    .getState()
    .favoriteRadioStations.some((station) => station.source === "server");
}

/**
 * Called from the Subsonic response interceptor for every observed
 * serverVersion. Records the version and, when the server may have been
 * renumbered, freezes the destructive reconcilers and marks a probe as due.
 *
 * The freeze happens here rather than when the probe answers: otherwise a
 * library sync pass runs in the gap and deletes the very files we are about to
 * repair.
 */
export function noteServerVersion(
  version: string,
  serverType: string | undefined,
): void {
  // The envelope's own `type` beats the user-picked server type: plenty of
  // people register their Navidrome as a generic OpenSubsonic server.
  if (serverType !== "navidrome") return;

  const sync = useLibrarySync.getState();
  const previous = sync.lastSeenServerVersion;
  // A changed version string is the signal. A null previous version means this
  // is the first run of a build that tracks it, which also covers the user who
  // upgraded Navidrome before updating Wavio — we can't rule the change out, so
  // we look. Both are "changed" here.
  if (previous === version) return;

  sync.setIdMigration({ lastSeenServerVersion: version });
  if (sync.idMigration === "checking") return;
  if (!hasLocalData()) return;

  // Deliberately not rate-limited: recording the version above is what makes
  // this fire once per version string, and skipping a genuine change would
  // leave it unnoticed forever (the version is already recorded, so a later
  // call sees no change). A server flapping between two versions costs one
  // cheap probe each way, and once migrated every id is canonical so
  // probeCandidates() comes back empty and no requests are issued at all.
  sync.setIdMigration({ idMigration: "checking" });
}
