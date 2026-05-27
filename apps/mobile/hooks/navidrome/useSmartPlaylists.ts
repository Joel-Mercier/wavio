import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSmartPlaylist,
  getSmartPlaylist,
  type SmartPlaylistBody,
  updateSmartPlaylist,
} from "@/services/navidrome/smartPlaylists";
import { useAuthBase } from "@/stores/auth";

const playlistDetailKey = (id: string) => ["nd", "playlist", id] as const;

const ownerListKey = (ownerId: string | null | undefined) =>
  ["nd", "playlists", "owner", ownerId ?? ""] as const;

export const useSmartPlaylist = (id: string | null | undefined) => {
  return useQuery({
    queryKey: playlistDetailKey(id ?? ""),
    queryFn: () => getSmartPlaylist(id as string),
    enabled: !!id,
  });
};

export const useCreateSmartPlaylist = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SmartPlaylistBody) => createSmartPlaylist(body),
    onSuccess: () => {
      const ownerId = useAuthBase.getState().userId;
      queryClient.invalidateQueries({ queryKey: ownerListKey(ownerId) });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

export const useUpdateSmartPlaylist = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SmartPlaylistBody }) =>
      updateSmartPlaylist(id, body),
    onSuccess: (_data, variables) => {
      const ownerId = useAuthBase.getState().userId;
      queryClient.invalidateQueries({
        queryKey: playlistDetailKey(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: ownerListKey(ownerId) });
      queryClient.invalidateQueries({ queryKey: ["playlist", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};
