import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useArtists } from "@/hooks/backend/useBrowsing";
import { LASTFM_NETWORK_MODE } from "@/hooks/lastFm/networkMode";
import { useLastFmEnabled } from "@/hooks/lastFm/useLastFmEnabled";
import { useLastFmTopArtists } from "@/hooks/lastFm/useLastFmStats";
import {
  pickLibrarySeeds,
  resolveSimilarArtists,
} from "@/services/lastFm/recommendations";
import { fetchSimilarArtists } from "@/services/lastFm/similar";
import { retryUnlessClientError } from "@/services/retry";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { mulberry32 } from "@/utils/shuffle";

// Asked for generously because most of a Last.fm similar-artists list won't be
// in any one library, and trimmed to SHOWN below.
const CANDIDATE_COUNT = 60;
const SHOWN = 12;
// Every owned artist in the month is eligible to seed the row, not just the
// top few: on a real library the artists someone plays most are routinely the
// ones with no neighbours in it — Michael Jackson names sixty artists a rock
// library hasn't got, while Pink Floyd four rows down names three it has. The
// walk below stops at the first seed that resolves, so a deep pool costs
// nothing on the common path, and it is bounded anyway by the TOP_STATS_COUNT
// (10) artists useLastFmTopArtists returns.
// The similar-artists list for a given artist is close to static.
const SIMILAR_STALE_TIME = 1000 * 60 * 60 * 12;

/**
 * "Because you listened to X", resolved to artists the user actually owns.
 *
 * The seed comes from the intersection of the user's Last.fm month and their
 * own library, not from the top of the Last.fm list: an artist they scrobbled
 * elsewhere is one whose neighbours this library is least likely to hold.
 *
 * Even an owned seed can name sixty artists the library hasn't got, so the
 * query walks the whole owned pool and stops at the first seed that resolves to
 * something — one request whenever the first seed lands, never more than the
 * ten artists Last.fm returns, and all of them cached for half a day. Plus the
 * artist index, which the artists tab already fetches
 * under the same query key, so on a warm cache the section costs the home
 * screen nothing beyond the Last.fm calls. The expensive part of the
 * ListenBrainz equivalent (a `search3` per name) is deliberately not repeated:
 * the names are matched against that index in memory instead.
 */
export function useLastFmBecauseYouListened({
  enabled = true,
  sessionSeed,
}: {
  enabled?: boolean;
  sessionSeed?: number;
} = {}) {
  const { userName, isEnabled } = useLastFmEnabled(enabled);
  const musicFolderId = useCurrentMusicFolderId();

  const topArtists = useLastFmTopArtists("1month", { enabled });
  const library = useArtists({ musicFolderId }, { enabled: isEnabled });

  const libraryArtists = useMemo(
    () =>
      library.data?.artists?.index?.flatMap((index) => index.artist ?? []) ??
      [],
    [library.data?.artists?.index],
  );

  const seeds = useMemo(() => {
    if (topArtists.data?.state !== "ready") return [];
    const owned = pickLibrarySeeds(
      topArtists.data.data.map((entry) => ({ name: entry.title })),
      libraryArtists,
      topArtists.data.data.length,
    );
    if (owned.length === 0) return [];
    // Rotated rather than sampled, so the fallthrough below keeps a stable
    // order to walk while the row still varies from session to session.
    const offset = Math.floor(mulberry32(sessionSeed || 1)() * owned.length);
    return [...owned.slice(offset), ...owned.slice(0, offset)];
  }, [topArtists.data, libraryArtists, sessionSeed]);

  const recommendation = useQuery({
    // The library size is part of the key because the answer depends on it:
    // without it, adding the one artist that would have matched leaves the row
    // showing its old verdict until the twelve hours are up.
    queryKey: [
      "lastfm",
      "becauseYouListened",
      userName,
      musicFolderId,
      seeds,
      libraryArtists.length,
    ],
    queryFn: async ({ signal }) => {
      for (const seed of seeds) {
        const similar = await fetchSimilarArtists({
          artist: seed,
          limit: CANDIDATE_COUNT,
          signal,
        });
        if (resolveSimilarArtists(similar, libraryArtists, 1).length > 0) {
          return { seedName: seed, similar };
        }
      }
      // Every seed named artists this library hasn't got. The row hides itself
      // rather than heading an empty carousel with the last one tried.
      return { seedName: null, similar: [] };
    },
    enabled: isEnabled && seeds.length > 0,
    staleTime: SIMILAR_STALE_TIME,
    networkMode: LASTFM_NETWORK_MODE,
    retry: retryUnlessClientError,
  });

  // Resolved here rather than inside the query so that the cache holds Last.fm
  // names instead of library ids: a server rescan can renumber the artists (see
  // Navidrome 0.64) and half a day of cached ids would then be dead links.
  const artists = useMemo(
    () =>
      resolveSimilarArtists(
        recommendation.data?.similar ?? [],
        libraryArtists,
        SHOWN,
      ),
    [recommendation.data?.similar, libraryArtists],
  );

  // Each stage is only "loading" once it has actually been asked to run: a
  // disabled react-query stays `isPending` forever, so a flat OR of the three
  // would leave the skeleton up permanently for an account with no owned seed
  // at all.
  const isLoading =
    (isEnabled && (topArtists.isPending || library.isPending)) ||
    (seeds.length > 0 && recommendation.isPending);

  return {
    seedName: recommendation.data?.seedName ?? undefined,
    artists,
    isLoading,
    error: topArtists.error ?? library.error ?? recommendation.error,
  };
}
