import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useArtists } from "@/hooks/backend/useBrowsing";
import type { AudioMuseSimilarArtist } from "@/services/audioMuse/types";
import { getArtistsByIds } from "@/services/backend/browsing";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Stable identity for the not-yet-loaded case, so callers can hand the query's
// `data` straight in without a fresh [] re-running every memo each render.
const NO_RESULTS: AudioMuseSimilarArtist[] = [];

/**
 * Turn AudioMuse's `{ artist, artist_id }` rows into artists the app can render.
 *
 * AudioMuse returns a name and — only when its own media-server registry could
 * resolve one — an id. Neither carries artwork, and an artist the active backend
 * doesn't know must not become a row at all: ArtistListItem's link stays enabled
 * while online, so a missing id would render a tap that navigates nowhere.
 *
 * Two paths, cheapest first:
 *  - the artists index is already cached (the Library artists screen and the home
 *    artists carousel both populate it) → match in memory for zero requests, and
 *    recover rows whose `artist_id` came back null by name.
 *  - it isn't → fetch just the ids, which costs one request on Jellyfin and the
 *    local db but one *per artist* on Subsonic. That's still far less than
 *    pulling a whole library's artist index to fill a twelve-item row.
 */
export function useHydratedArtists(
  results: AudioMuseSimilarArtist[] | undefined,
  enabled = true,
) {
  const rows = results ?? NO_RESULTS;
  const musicFolderId = useCurrentMusicFolderId();
  // enabled:false observes the cache without ever fetching it, and still
  // re-renders when another screen fills that key in.
  const { data: cachedIndex } = useArtists(
    { musicFolderId },
    { enabled: false },
  );

  const cachedArtists = useMemo(
    () => cachedIndex?.artists?.index?.flatMap((index) => index.artist ?? []),
    [cachedIndex],
  );

  const ids = useMemo(
    () =>
      rows.map((result) => result.artist_id).filter((id): id is string => !!id),
    [rows],
  );

  const { data: fetched } = useQuery({
    queryKey: ["audiomuse", "hydrateArtists", ids],
    queryFn: () => getArtistsByIds(ids),
    enabled: enabled && !cachedArtists && ids.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  return useMemo<ArtistID3[]>(() => {
    const pool = cachedArtists ?? fetched;
    if (!pool?.length) return [];

    const byId = new Map(pool.map((artist) => [artist.id, artist]));
    const byName = new Map(
      pool.map((artist) => [normalizeName(artist.name), artist]),
    );

    // AudioMuse ranks nearest-first; keep that order and drop what we can't resolve.
    const seen = new Set<string>();
    return rows.reduce<ArtistID3[]>((artists, result) => {
      const match =
        (result.artist_id ? byId.get(result.artist_id) : undefined) ??
        byName.get(normalizeName(result.artist));
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        artists.push(match);
      }
      return artists;
    }, []);
  }, [rows, cachedArtists, fetched]);
}
