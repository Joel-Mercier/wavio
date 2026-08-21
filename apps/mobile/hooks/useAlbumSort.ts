import { useMemo } from "react";
import { useAlbumList2 } from "@/hooks/backend/useLists";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import {
  type AlbumSortField,
  type AlbumSortType,
  albumLockedDirections,
  albumSortListType,
  albumSortParams,
  availableAlbumSortFields,
  DEFAULT_ALBUM_SORT,
  resolveAlbumSort,
} from "@/utils/albumSort";
import { effectiveSort, parseSortType, type SortDirection } from "@/utils/sort";

export const ALBUM_PAGE_SIZE = 20;
// A random order re-seeds on every request on all four backends, so paging into
// it would repeat and skip albums and never reach an end. Draw one larger page
// instead and stop, which is what "random" can honestly mean for a browse.
export const ALBUM_RANDOM_PAGE_SIZE = 100;
// One album answers "does this library hold any of this data at all".
const COVERAGE_PROBE_SIZE = 1;

// undefined until the probe answers: a paused (offline) or failed request must
// read as unknown rather than as "no data" (see availableAlbumSortFields).
function hasRows(albums: AlbumID3[] | undefined): boolean | undefined {
  return albums === undefined ? undefined : albums.length > 0;
}

// Whether the library has anything behind the play-count / last-played / rating
// browses (ALBUM_SORT_COVERAGE_FIELDS). `enabled` is what keeps this off the
// library list: components/library/LibraryListItem calls useAlbumSort only to
// rebuild the browse's query key and must not fire three requests per row.
// Disabled the queries still read — and re-render on — whatever the album
// screen already cached, so both sides derive the same key from the same
// coverage. Answers persist with the rest of the query cache, so a warm start
// knows before the sheet can be opened.
function useAlbumSortCoverage(
  enabled: boolean,
): Partial<Record<AlbumSortField, boolean>> {
  const musicFolderId = useCurrentMusicFolderId();
  const options = { enabled };
  const playCount = useAlbumList2(
    {
      type: albumSortListType("playCount"),
      size: COVERAGE_PROBE_SIZE,
      musicFolderId,
    },
    options,
  );
  const lastPlayed = useAlbumList2(
    {
      type: albumSortListType("lastPlayed"),
      size: COVERAGE_PROBE_SIZE,
      musicFolderId,
    },
    options,
  );
  const rating = useAlbumList2(
    {
      type: albumSortListType("rating"),
      size: COVERAGE_PROBE_SIZE,
      musicFolderId,
    },
    options,
  );
  const playCountAlbums = playCount.data?.albumList2?.album;
  const lastPlayedAlbums = lastPlayed.data?.albumList2?.album;
  const ratingAlbums = rating.data?.albumList2?.album;
  return useMemo(
    () => ({
      playCount: hasRows(playCountAlbums),
      lastPlayed: hasRows(lastPlayedAlbums),
      rating: hasRows(ratingAlbums),
    }),
    [playCountAlbums, lastPlayedAlbums, ratingAlbums],
  );
}

// The sort the whole-library album browse actually runs with, and the request
// params it produces. `listParams` is what goes to the backend — and therefore
// into the react-query key — so anything that has to reproduce that key
// (components/library/LibraryListItem's offline-reachability check) derives it
// from here rather than assuming the default.
export function useAlbumSort(options?: {
  // Ask the backend which of the data-dependent fields it can actually fill.
  // The album browse screen owns this; every other caller reads the cached
  // answer (see useAlbumSortCoverage).
  probeCoverage?: boolean;
}): {
  sortFields: AlbumSortField[];
  activeSort: AlbumSortType;
  // The raw preference, before the backend's direction locks are applied. The
  // offline fallback sorts the whole list in memory, so it can honour a
  // direction the server browse can't and reads this instead of `activeSort`.
  persistedSort: AlbumSortType;
  lockedDirections: Partial<Record<AlbumSortField, SortDirection | "none">>;
  // What the browse request and its react-query key are built from — including
  // the page size, so anything reproducing that key can't drift from the screen.
  listParams: { type: AlbumListType; order?: SortDirection; size: number };
  isRandom: boolean;
  resolve: (next: AlbumSortType) => AlbumSortType;
} {
  const serverType = useAuthBase((store) => store.serverType);
  const hasNavidromeNative = useAuthBase((store) => store.hasNavidromeNative);
  const sort = useApp((store) => store.allAlbumsSort);
  const lockedDirections = useMemo(
    () => albumLockedDirections(serverType, hasNavidromeNative),
    [serverType, hasNavidromeNative],
  );
  // Every backend can order albums, so unlike the track browse a field is only
  // withheld when the library holds no data for it — the direction is the other
  // thing this backend may not serve. A persisted sort the current server can't
  // honour (a locked `desc`, or a field it has no data for) is snapped back
  // without overwriting the preference, so it comes back on a server that can.
  const coverage = useAlbumSortCoverage(options?.probeCoverage ?? false);
  const sortFields = useMemo(
    () => availableAlbumSortFields(coverage),
    [coverage],
  );
  const activeSort = resolveAlbumSort(
    effectiveSort(sort, sortFields, DEFAULT_ALBUM_SORT),
    lockedDirections,
  );
  const isRandom = parseSortType(activeSort).field === "random";
  const listParams = useMemo(
    () => ({
      ...albumSortParams(activeSort),
      size: isRandom ? ALBUM_RANDOM_PAGE_SIZE : ALBUM_PAGE_SIZE,
    }),
    [activeSort, isRandom],
  );
  return {
    sortFields,
    activeSort,
    persistedSort: sort,
    lockedDirections,
    listParams,
    isRandom,
    resolve: (next: AlbumSortType) => resolveAlbumSort(next, lockedDirections),
  };
}
