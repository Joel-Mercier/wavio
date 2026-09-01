import useOffline from "@/stores/offline";
import usePlaylists from "@/stores/playlists";
import useRecentPlays from "@/stores/recentPlays";

/**
 * Drop the local traces of a playlist that no longer exists on the server: its
 * home shortcut (which the widget and the Android Auto browse tree mirror) and
 * the sort / manual-order preferences keyed by its id.
 *
 * The id is always marked deleted, so the detail screen's queries stay disabled
 * and stop re-requesting it — Navidrome answers a deleted playlist with a 500
 * on its native endpoint (WAVIO-H3). The marker is dropped again by
 * `reconcileDeletedPlaylists` if the id ever comes back in a listing.
 *
 * Downloads are deliberately left alone — `useCollectionDownload` owns that
 * lifecycle explicitly, and `librarySyncService.handlePlaylistDeleted` already
 * drops the auto copy. The React Query cache is handled separately by
 * `forgetPlaylistQueries`, which can only run once the detail screen's observer
 * is gone.
 *
 * `keepIfDownloaded` is for the self-healing path: a playlist deleted on the
 * server but still saved offline stays browsable through `useOfflinePlaylist`,
 * so its shortcut — and the sort / manual order the offline copy is rendered
 * with — still work and must survive. An explicit in-app delete passes it as
 * false: the user asked for the entry to go.
 */
export function forgetDeletedPlaylist(
  id: string,
  { keepIfDownloaded = false }: { keepIfDownloaded?: boolean } = {},
): void {
  usePlaylists.getState().markPlaylistDeleted(id);
  if (keepIfDownloaded && useOffline.getState().downloadedCollections[id]) {
    return;
  }
  usePlaylists.getState().clearPlaylistPreferences(id);
  useRecentPlays.getState().removeRecentPlay(id);
}
