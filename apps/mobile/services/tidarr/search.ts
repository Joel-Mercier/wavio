import { tidalProxyRequest } from "@/services/tidarr";
import type { TidalSearchResponse } from "@/services/tidarr/types";

export const TIDARR_SEARCH_PAGE_SIZE = 20;

// One call answers albums, artists and tracks at once, so a search costs a
// single request no matter how many sections the screen renders.
export async function searchTidal(
  query: string,
  { limit = TIDARR_SEARCH_PAGE_SIZE, offset = 0 } = {},
): Promise<TidalSearchResponse> {
  return tidalProxyRequest<TidalSearchResponse>("/v2/search", {
    query,
    limit,
    offset,
  });
}
