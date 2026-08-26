import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  lookupAlbum,
  lookupAlbumsByArtist,
  search,
} from "@/services/lidarr/search";
import type { LidarrAlbum } from "@/services/lidarr/types";
import useLidarr from "@/stores/lidarr";

const MIN_QUERY_LENGTH = 2;

// Unified artist + album search. `term` should already be debounced by the
// caller. Disabled until Lidarr is connected and the term is long enough.
export function useLidarrSearch(term: string) {
  const isConnected = useLidarr((store) => store.isConnected);
  const trimmed = term.trim();
  const isSearchable = trimmed.length >= MIN_QUERY_LENGTH;
  return useQuery({
    queryKey: ["lidarr", "search", trimmed],
    queryFn: () => search(trimmed),
    enabled: isConnected && isSearchable,
    staleTime: 1000 * 60 * 5,
    // Editing an existing query would otherwise blank the list for the length
    // of the request. Dropped once the term is too short to search, or clearing
    // the field would leave the previous results on screen.
    placeholderData: isSearchable ? keepPreviousData : undefined,
  });
}

// An artist's discography (album/lookup by name), for browsing an artist that
// isn't in Lidarr yet.
export function useLidarrArtistAlbums(artistName: string | undefined) {
  const isConnected = useLidarr((store) => store.isConnected);
  const name = (artistName ?? "").trim();
  return useQuery({
    queryKey: ["lidarr", "artistAlbums", name],
    queryFn: () => lookupAlbumsByArtist(name),
    enabled: isConnected && name.length > 0,
    staleTime: 1000 * 60 * 30,
  });
}

// A single album for the detail screen. Reads the cache seeded when navigating
// from a card; falls back to a lookup for cold deep links.
export function useLidarrAlbum(
  foreignAlbumId: string | undefined,
  initialData?: LidarrAlbum,
) {
  const isConnected = useLidarr((store) => store.isConnected);
  const id = (foreignAlbumId ?? "").trim();
  return useQuery({
    queryKey: ["lidarr", "album", id],
    queryFn: () => lookupAlbum(id),
    enabled: isConnected && id.length > 0,
    initialData,
    staleTime: 1000 * 60 * 30,
  });
}
