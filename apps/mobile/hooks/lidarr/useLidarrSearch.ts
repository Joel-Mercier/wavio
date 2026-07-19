import { useQuery } from "@tanstack/react-query";
import {
  type LidarrAlbum,
  lookupAlbum,
  lookupAlbumsByArtist,
  search,
} from "@/services/lidarr";
import useLidarr from "@/stores/lidarr";

const MIN_QUERY_LENGTH = 2;

// Unified artist + album search. `term` should already be debounced by the
// caller. Disabled until Lidarr is connected and the term is long enough.
export function useLidarrSearch(term: string) {
  const isConnected = useLidarr((store) => store.isConnected);
  const trimmed = term.trim();
  return useQuery({
    queryKey: ["lidarr", "search", trimmed],
    queryFn: () => search(trimmed),
    enabled: isConnected && trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60 * 5,
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
