import { useEffect } from "react";
import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";

/**
 * Keep a home shortcut's title and cover in step with the server while its
 * detail screen is open.
 *
 * The shortcuts store only ever learned an item's metadata at the moment it was
 * played, so renaming a playlist or changing its cover left the shortcut
 * showing the old values forever — a fresh app launch included, since the store
 * is persisted. Refreshing (rather than re-adding) means browsing an item that
 * isn't a shortcut doesn't turn it into one.
 *
 * Pass the *server* copy: an offline fallback can be older than what the screen
 * is about to fetch.
 */
export function useRefreshRecentPlay(
  entry: Pick<RecentPlay, "id" | "type" | "title" | "coverArt"> | undefined,
): void {
  const { id, type, title, coverArt } = entry ?? {};
  useEffect(() => {
    if (!id || !type || !title) return;
    useRecentPlays.getState().refreshRecentPlay({ id, type, title, coverArt });
  }, [id, type, title, coverArt]);
}
