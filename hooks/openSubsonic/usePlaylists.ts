import { createPlaylist, deletePlaylist, getPlaylist, getPlaylists, updatePlaylist } from "@/services/openSubsonic/playlists";
import { useMutation, useQuery } from "@tanstack/react-query";

export const usePlaylists = (params: { username?: string }) => {
  return useQuery({
    queryKey: ["playlists", params],
    queryFn: () => {
      return getPlaylists(params);
    },
  });
};

export const useCreatePlaylist = () => {
  const query = useMutation({
    mutationFn: (params: { name: string, songId?: string[] }) => {
      const { name, songId } = params;
      return createPlaylist(name, songId);
    },
  });

  return query;
};

export const useUpdatePlaylist = () => {
  const query = useMutation({
    mutationFn: (params: { id: string, name?: string, comment?: string, isPublic?: boolean, songIdToAdd?: string[], songIndexToRemove?: string[] }) => {
      const { id, name, comment, isPublic, songIdToAdd, songIndexToRemove } = params;
      return updatePlaylist(id, { name, comment, isPublic, songIdToAdd, songIndexToRemove });
    },
  });

  return query;
};

export const useDeletePlaylist = () => {
  const query = useMutation({
    mutationFn: (params: { id: string }) => {
      const { id } = params;
      return deletePlaylist(id);
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