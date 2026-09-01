import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  updatePlaylist,
} from "@/services/backend/playlists";
import { forgetDeletedPlaylist } from "@/services/forgetPlaylist";
import { getIsEffectivelyOnline } from "@/services/network";
import { isNotFoundError } from "@/services/notFound";
import { librarySyncService } from "@/services/offline";
import { enqueueOfflineMutation } from "@/services/offlineMutations/enqueue";
import type { PlaylistWithSongs } from "@/services/openSubsonic/types";
import type { OfflineAction } from "@/stores/offlineMutations";
import usePlaylistsStore from "@/stores/playlists";

export const usePlaylists = (
  params: { username?: string },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["playlists", params],
    queryFn: async () => {
      const response = await getPlaylists(params);
      usePlaylistsStore
        .getState()
        .reconcileDeletedPlaylists(
          (response?.playlists?.playlist ?? []).map((playlist) => playlist.id),
        );
      return response;
    },
    enabled: options?.enabled,
  });
};

export const useCreatePlaylist = () => {
  const query = useMutation({
    mutationFn: (params: { name: string; songId?: string[] }) => {
      const name = params.name.trim();
      if (!name) {
        throw new Error("Playlist name is required");
      }
      return createPlaylist(name, params.songId);
    },
  });

  return query;
};

export const useUpdatePlaylist = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    // "always": the default "online" mode would pause the mutation before
    // mutationFn runs, so the offline enqueue branch would never execute.
    networkMode: "always",
    mutationFn: async (params: {
      id: string;
      name?: string;
      comment?: string;
      isPublic?: boolean;
      songIdToAdd?: string[];
      songIndexToRemove?: string[];
    }) => {
      const { id, name, comment, isPublic, songIdToAdd, songIndexToRemove } =
        params;
      if (!getIsEffectivelyOnline()) {
        const actions: OfflineAction[] = [];
        if (
          name !== undefined ||
          comment !== undefined ||
          isPublic !== undefined
        ) {
          actions.push({
            type: "playlistEdit",
            playlistId: id,
            name,
            comment,
            isPublic,
          });
        }
        if (songIndexToRemove?.length) {
          // Callers compute positional indices against the cached playlist
          // entries; convert them to song ids here so replay can re-resolve
          // indices against the server's list at that time.
          const entry = queryClient.getQueryData<{
            playlist: PlaylistWithSongs;
          }>(["playlist", id])?.playlist?.entry;
          if (!entry) {
            throw new Error(
              "Cannot remove songs from an uncached playlist while offline",
            );
          }
          const songIds = songIndexToRemove.flatMap((index) => {
            const songId = entry[Number(index)]?.id;
            return songId ? [songId] : [];
          });
          actions.push({
            type: "playlistRemoveSongs",
            playlistId: id,
            songIds,
          });
        }
        if (songIdToAdd?.length) {
          actions.push({
            type: "playlistAddSongs",
            playlistId: id,
            songIds: songIdToAdd,
          });
        }
        for (const action of actions) {
          enqueueOfflineMutation(queryClient, action);
        }
        return { queued: true } as const;
      }
      const result = await updatePlaylist(id, {
        name,
        comment,
        isPublic,
        songIdToAdd,
        songIndexToRemove,
      });
      // Keep the extended-offline auto copy in step with the edit instead of
      // waiting for the next library pass.
      void librarySyncService.refreshPlaylist(id);
      return result;
    },
  });

  return query;
};

export const useDeletePlaylist = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    networkMode: "always",
    mutationFn: async (params: { id: string }) => {
      const { id } = params;
      if (!getIsEffectivelyOnline()) {
        return enqueueOfflineMutation(queryClient, {
          type: "playlistDelete",
          playlistId: id,
        });
      }
      // A playlist that is already gone (deleted from another client, or a
      // second tap on a stale list) is the end state the caller asked for, not
      // a failure — reporting it would leave the user unable to clear a
      // shortcut pointing at something the server no longer has.
      const result = await deletePlaylist(id).catch((error) => {
        if (!isNotFoundError(error)) throw error;
        return undefined;
      });
      librarySyncService.handlePlaylistDeleted(id);
      return result;
    },
    // Store-side cleanup only. Dropping the cached queries has to wait until
    // the detail screen unmounts — removing them from under its live observers
    // leaves the next render with no data and `refetchOnMount: "always"`, which
    // immediately re-requests the playlist we just deleted. PlaylistDetail owns
    // that half (see the doc block on forgetPlaylistQueries).
    //
    // Offline, the delete has only been queued: the playlist is still on the
    // server, and the queued action can still be dropped (auth error, permanent
    // 4xx, cleared queue, sign-out). Forgetting it here would strand a live
    // playlist with no shortcut, sort or manual order, so the replay does it
    // once the server has actually seen the delete.
    onSuccess: (result, { id }) => {
      if (result && "queued" in result) return;
      forgetDeletedPlaylist(id);
    },
  });

  return query;
};

export const usePlaylist = (id: string) => {
  // A playlist already known to be gone must not be re-requested: the detail
  // screen can stay mounted long after the deletion (it navigates away without
  // always being popped), and a shortcut kept for its downloads reopens it on
  // later launches. Navidrome answers a deleted playlist with a 500 on its
  // native endpoint (WAVIO-H3).
  const isDeleted = usePlaylistsStore((store) => !!store.deletedPlaylists[id]);
  const query = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => {
      return getPlaylist(id);
    },
    refetchOnMount: "always",
    enabled: !isDeleted,
  });

  return query;
};
