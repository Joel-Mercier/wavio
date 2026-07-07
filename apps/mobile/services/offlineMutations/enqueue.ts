import type { QueryClient } from "@tanstack/react-query";
import {
  applyOptimistic,
  findChildInCaches,
} from "@/services/offlineMutations/optimistic";
import type {
  AlbumWithSongsID3,
  ArtistWithAlbumsID3,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import useOfflineMutations, {
  type OfflineAction,
} from "@/stores/offlineMutations";

export type QueuedResult = { queued: true };

export const isQueuedResult = (data: unknown): data is QueuedResult =>
  typeof data === "object" &&
  data !== null &&
  (data as QueuedResult).queued === true;

const playlistName = (queryClient: QueryClient, playlistId: string) =>
  queryClient.getQueryData<{ playlist: PlaylistWithSongs }>([
    "playlist",
    playlistId,
  ])?.playlist?.name;

const labelForAction = (
  queryClient: QueryClient,
  action: OfflineAction,
): string | undefined => {
  switch (action.type) {
    case "star": {
      const { target } = action;
      if (target.kind === "song") {
        return findChildInCaches(queryClient, target.id)?.title;
      }
      if (target.kind === "album") {
        return queryClient.getQueryData<{ album: AlbumWithSongsID3 }>([
          "album",
          target.id,
        ])?.album?.name;
      }
      return queryClient.getQueryData<{ artist: ArtistWithAlbumsID3 }>([
        "artist",
        target.id,
      ])?.artist?.name;
    }
    case "setRating":
      return (
        findChildInCaches(queryClient, action.id)?.title ??
        queryClient.getQueryData<{ album: AlbumWithSongsID3 }>([
          "album",
          action.id,
        ])?.album?.name
      );
    case "playlistAddSongs":
    case "playlistRemoveSongs":
    case "playlistEdit":
    case "playlistDelete":
      return playlistName(queryClient, action.playlistId);
  }
};

// Records an action taken while the server is unreachable: stores it for
// replay and patches the query cache so the UI reflects it immediately.
export function enqueueOfflineMutation(
  queryClient: QueryClient,
  action: OfflineAction,
): QueuedResult {
  useOfflineMutations
    .getState()
    .enqueue(action, labelForAction(queryClient, action));
  applyOptimistic(queryClient, action);
  return { queued: true };
}
