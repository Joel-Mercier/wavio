import { useQuery } from "@tanstack/react-query";
import { getPlaylistsByOwner } from "@/services/navidrome/playlists";

export const useNavidromePlaylistsByOwner = (
  ownerId: string | null | undefined,
) => {
  return useQuery({
    queryKey: ["nd", "playlists", "owner", ownerId ?? ""],
    queryFn: () => getPlaylistsByOwner(ownerId as string),
    enabled: !!ownerId,
  });
};
