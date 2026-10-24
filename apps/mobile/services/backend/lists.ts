import {
  dispatch,
  isNavidrome,
  isNavidromeNative,
} from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/lists";
import * as L from "@/services/local/lists";
import * as NA from "@/services/navidrome/albums";
import * as N from "@/services/navidrome/songs";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import * as S from "@/services/openSubsonic/lists";
import { leastPlayed } from "@/utils/leastPlayed";

export type { AlbumListType } from "@/services/openSubsonic/lists";

export const getAlbumList = dispatch(
  S.getAlbumList,
  J.getAlbumList,
  L.getAlbumList,
);
// `order` is only ever set for a direction the album-list type doesn't serve on
// its own (utils/albumSort.ts), and the Subsonic surface can't produce one:
// getAlbumList2 takes no sort order, so each `type` is stuck with a single
// direction. Navidrome's native API can, so a reversed browse goes there — but
// only with the native session, since `/api/album` answers 401 without it (a
// Navidrome server without one keeps every field except `byYear` locked, and
// `byYear` reverses on the Subsonic surface by swapping the year bounds).
// Same shape as the isNavidrome() ternary in getSongs below.
//
// An unbounded `byYear` goes native in *both* directions, not just the reversed
// one: on the Subsonic surface a year sort has to be spelled as a year filter
// (see YEAR_SORT_BOUNDS in services/openSubsonic/lists.ts), which reaches only
// the albums the server can place in a range. Routing the ascending half there
// too keeps a `_sort=maxYear` browse returning the same albums whichever way
// it is pointed. A byYear call that carries real bounds is a genuine filter
// (the home decade carousels) and stays on getAlbumList2, which is the only
// implementation that honours them.
export const getAlbumList2 = dispatch(
  (type: AlbumListType, params: Parameters<typeof S.getAlbumList2>[1]) =>
    isNavidromeNative() &&
    (params?.order ||
      (type === "byYear" && params?.fromYear == null && params?.toYear == null))
      ? NA.getAlbumList2(type, params)
      : S.getAlbumList2(type, params),
  J.getAlbumList2,
  L.getAlbumList2,
);
// The Subsonic spec has no least-played list and no sort order, but every
// backend serves `random` with a per-album playCount (Jellyfin's summed from
// its tracks): take a random pool and
// keep its least-played slice. `offset` counts result rows, so page n reads
// pool n. `poolCount` is the untrimmed size, so pagination can tell "server
// ran out" from "nothing left after trimming".
const LEAST_PLAYED_POOL_FACTOR = 4;
const SUBSONIC_MAX_LIST_SIZE = 500;

const getRandomAlbumPool = dispatch(
  (params: Parameters<typeof S.getAlbumList2>[1]) =>
    S.getAlbumList2("random", params),
  J.getRandomAlbumsWithPlayCounts,
  (params: Parameters<typeof L.getAlbumList2>[1]) =>
    L.getAlbumList2("random", params),
);

export const getLeastPlayedAlbums = async ({
  size = 20,
  offset = 0,
  musicFolderId,
}: {
  size?: number;
  offset?: number;
  musicFolderId?: string;
} = {}) => {
  const poolSize = Math.min(
    size * LEAST_PLAYED_POOL_FACTOR,
    SUBSONIC_MAX_LIST_SIZE,
  );
  const response = await getRandomAlbumPool({
    size: poolSize,
    offset: Math.floor(offset / size) * poolSize,
    musicFolderId,
  });
  const pool = response?.albumList2?.album ?? [];
  return {
    ...response,
    albumList2: { ...response?.albumList2, album: leastPlayed(pool, size) },
    poolCount: pool.length,
  };
};
export const getNowPlaying = dispatch(
  S.getNowPlaying,
  J.getNowPlaying,
  L.getNowPlaying,
);
export const getRandomSongs = dispatch(
  S.getRandomSongs,
  J.getRandomSongs,
  L.getRandomSongs,
);
// Navidrome answers a *sorted* whole-library browse from its native API: the
// Subsonic surface has none (the browse is an empty-query search3, which takes
// no sort parameter). Unsorted, it stays on search3 like every other Subsonic
// server — same shape as the isNavidrome() ternary in services/backend/browsing.
export const getSongs = dispatch(
  (params: Parameters<typeof S.getSongs>[0]) =>
    isNavidrome() && params?.sort ? N.getSongs(params) : S.getSongs(params),
  J.getSongs,
  L.getSongs,
);
export const getSongsByGenre = dispatch(
  S.getSongsByGenre,
  J.getSongsByGenre,
  L.getSongsByGenre,
);
// The `subsonic` slot is Navidrome's native-API impl (guarded to return empty
// for plain OpenSubsonic, which the `mostPlayedTracks` capability gates off).
export const getMostPlayedSongs = dispatch(
  N.getMostPlayedSongs,
  J.getMostPlayedSongs,
  L.getMostPlayedSongs,
);
export const getStarred = dispatch(S.getStarred, J.getStarred, L.getStarred);
export const getStarred2 = dispatch(
  S.getStarred2,
  J.getStarred2,
  L.getStarred2,
);
