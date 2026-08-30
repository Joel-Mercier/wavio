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
