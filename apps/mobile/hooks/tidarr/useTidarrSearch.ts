import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { TIDARR_NETWORK_MODE } from "@/hooks/tidarr/networkMode";
import { searchTidal } from "@/services/tidarr/search";
import useTidarr from "@/stores/tidarr";

const MIN_QUERY_LENGTH = 2;

// Merged album + artist + track search against the Tidal catalog, proxied by
// the Tidarr instance. `term` should already be debounced by the caller.
export function useTidarrSearch(term: string) {
  const isConnected = useTidarr((store) => store.isConnected);
  const trimmed = term.trim();
  const isSearchable = trimmed.length >= MIN_QUERY_LENGTH;
  return useQuery({
    queryKey: ["tidarr", "search", trimmed],
    queryFn: () => searchTidal(trimmed),
    enabled: isConnected && isSearchable,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
    // Editing an existing query would otherwise blank the list for the length
    // of the request. Dropped once the term is too short to search, or clearing
    // the field would leave the previous results on screen.
    placeholderData: isSearchable ? keepPreviousData : undefined,
  });
}
