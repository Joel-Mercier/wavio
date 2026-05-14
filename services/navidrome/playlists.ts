import navidromeApiInstance from "@/services/navidrome";

export interface NavidromePlaylist {
  id: string;
  name: string;
  comment?: string;
  ownerId?: string;
  ownerName?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
}

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
  return rsp.data;
};
