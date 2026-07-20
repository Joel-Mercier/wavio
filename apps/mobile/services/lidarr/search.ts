import { lidarrRequest } from "@/services/lidarr";
import type { LidarrAlbum, LidarrSearchResult } from "@/services/lidarr/types";

// Unified search: returns a mixed list of artist and album matches from
// Lidarr's metadata server (MusicBrainz-backed).
export async function search(term: string): Promise<LidarrSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];
  return lidarrRequest<LidarrSearchResult[]>("/search", {
    params: { term: trimmed },
  });
}

// Lists albums matching an artist name via album/lookup. Used to browse the
// discography of an artist that isn't added to Lidarr yet, without writing
// anything. Callers scope the result to the exact artist by foreign id.
export async function lookupAlbumsByArtist(
  artistName: string,
): Promise<LidarrAlbum[]> {
  const trimmed = artistName.trim();
  if (!trimmed) return [];
  return lidarrRequest<LidarrAlbum[]>("/album/lookup", {
    params: { term: trimmed },
  });
}

// Best-effort lookup of a single album by its foreign (MusicBrainz) id. Only a
// fallback for cold deep links — normally the album is seeded into the query
// cache when navigating from a card.
export async function lookupAlbum(
  foreignAlbumId: string,
): Promise<LidarrAlbum | null> {
  const results = await lidarrRequest<LidarrAlbum[]>("/album/lookup", {
    params: { term: foreignAlbumId },
  });
  return results.find((a) => a.foreignAlbumId === foreignAlbumId) ?? null;
}
