import navidromeApiInstance from "@/services/navidrome";
import type { NavidromeGenre } from "@/services/navidrome/types";
import { okEnvelope } from "@/services/openSubsonic/index";
import type { Genres } from "@/services/openSubsonic/types";

// Genres restricted to one library, via Navidrome's native REST API
// (`GET /api/genre?library_id=`) — the Subsonic getGenres endpoint has no
// musicFolderId param, so it can only return server-wide genres. The native
// response carries no song/album counts (Navidrome ≥ 0.58 serializes only
// id/name), so the mapped genres leave them undefined and the UI hides them.
export const getGenres = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) => {
  const rsp = await navidromeApiInstance.get<NavidromeGenre[]>("/genre", {
    params: {
      library_id: musicFolderId,
      _sort: "name",
    },
  });
  const genres: Genres = {
    genre: (rsp.data ?? []).map((g) => ({ value: g.name })),
  };
  return okEnvelope({ genres });
};
