import type { QueryClient } from "@tanstack/react-query";

/**
 * Drop every cached view of a playlist that no longer exists.
 *
 * The detail screen is still mounted while it navigates away, so its queries
 * would otherwise refetch the deleted playlist — and Navidrome's native
 * `/api/playlist/{id}` answers that with a **500**, not a 404, so it surfaces as
 * a server error rather than a benign miss (Sentry WAVIO-H3). Remove rather than
 * invalidate: invalidating asks for a refetch, which is precisely the request we
 * are trying to prevent.
 *
 * Kept in its own leaf module (only the react-query type) so it stays cheap to
 * import and to test — `useDeletePlaylist`'s module pulls in the whole backend
 * service tree.
 */
export function forgetPlaylistQueries(
  queryClient: QueryClient,
  id: string,
): void {
  for (const queryKey of [
    ["playlist", id],
    ["nd", "playlist", id],
  ]) {
    void queryClient.cancelQueries({ queryKey });
    queryClient.removeQueries({ queryKey });
  }
}
