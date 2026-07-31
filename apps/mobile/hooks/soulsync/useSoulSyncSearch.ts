import { useQuery } from "@tanstack/react-query";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { search } from "@/services/soulsync/search";
import useSoulSync from "@/stores/soulsync";

const MIN_QUERY_LENGTH = 2;

// Merged track + album + artist search. `term` should already be debounced by
// the caller. Disabled until SoulSync is connected and the term is long enough
// — the API allows 60 requests/minute and one search costs three of them.
export function useSoulSyncSearch(term: string) {
  const isConnected = useSoulSync((store) => store.isConnected);
  const trimmed = term.trim();
  return useQuery({
    queryKey: ["soulsync", "search", trimmed],
    queryFn: () => search(trimmed),
    enabled: isConnected && trimmed.length >= MIN_QUERY_LENGTH,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
  });
}
