import { soulSyncRequest } from "@/services/soulsync";
import type { SoulSyncLibraryAlbum } from "@/services/soulsync/types";

interface RecentlyAddedResponse {
  items: SoulSyncLibraryAlbum[];
  type: string;
}

// What SoulSync actually imported, newest first. This stands in for a download
// history the API doesn't have: /downloads reads an in-memory tracker that a
// cleanup pass prunes minutes after a task settles and that empties on restart,
// so a finished download is only durably visible once it reaches the library.
//
// `fields` trims the response — the album serializer returns every column,
// including a match-status block per metadata provider, which is far more than
// a list row needs. `server_source` is asked for because `thumb_url` is
// meaningless without it (see artwork.ts). There is deliberately no artist name
// in the list: the endpoint selects the album table without joining artists.
export async function fetchRecentlyAddedAlbums(
  limit = 20,
): Promise<SoulSyncLibraryAlbum[]> {
  const data = await soulSyncRequest<RecentlyAddedResponse>(
    "/library/recently-added",
    {
      params: {
        type: "albums",
        limit,
        fields: "id,title,year,thumb_url,server_source,created_at",
      },
    },
  );
  return data?.items ?? [];
}
