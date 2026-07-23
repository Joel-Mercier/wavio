import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  updatePlaylist,
} from "@/services/backend/playlists";
import { getIsEffectivelyOnline } from "@/services/network";
import { librarySyncService } from "@/services/offline";
import { enqueueOfflineMutation } from "@/services/offlineMutations/enqueue";
import type { PlaylistWithSongs } from "@/services/openSubsonic/types";
import type { OfflineAction } from "@/stores/offlineMutations";

export const usePlaylists = (
  params: { username?: string },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["playlists", params],
    queryFn: () => {
      return getPlaylists(params);
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
      const result = await deletePlaylist(id);
      librarySyncService.handlePlaylistDeleted(id);
      return result;
    },
  });

  return query;
};

export const usePlaylist = (id: string) => {
  const query = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => {
      return getPlaylist(id);
    },
  });

  return query;
};
