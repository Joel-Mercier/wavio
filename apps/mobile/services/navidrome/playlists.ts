import navidromeApiInstance from "@/services/navidrome";
import { asList } from "@/services/navidrome/listBody";
import type { NavidromePlaylist } from "@/services/navidrome/types";

export type { NavidromePlaylist } from "@/services/navidrome/types";

export const getPlaylistsByOwner = async (
  ownerId: string,
): Promise<NavidromePlaylist[]> => {
  const rsp = await navidromeApiInstance.get<NavidromePlaylist[]>("/playlist", {
    params: {
      _filters: JSON.stringify({ owner_id: ownerId }),
      _sort: "name",
      _order: "ASC",
    },
  });
  return asList<NavidromePlaylist>(rsp.data);
};

// Every smart playlist the user can see, not just their own. Navidrome's
// `smart` filter can't be used: whatever its value, it returns only the
// regular playlists (it backs the web UI's add-to-playlist picker).
export const getVisibleSmartPlaylists = async (): Promise<
  NavidromePlaylist[]
> => {
  const rsp = await navidromeApiInstance.get<NavidromePlaylist[]>("/playlist");
  return asList<NavidromePlaylist>(rsp.data).filter((p) => p.rules);
};
