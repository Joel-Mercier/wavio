import type { BackendCapabilities } from "@/services/backend/capabilities";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import type { Child } from "@/services/openSubsonic/types";
import type { ServerType } from "@/stores/servers";
import {
  parseSortType,
  type SortFieldSpecs,
  type SortType,
} from "@/utils/sort";
import { TRACK_SORT_SPECS } from "@/utils/trackSort";

// Sorting for the whole-library track browse (components/library/AllTracksScreen).
// Unlike every other sorted list in the app, this one is paginated: only the
// fetched pages are in memory, so a client-side sort would order the first page
// and then append unsorted rows behind it. The order therefore has to be pushed
// into the backend call, which is why this field set is its own thing rather
// than utils/trackSort's: it lists only what all three sortable backends can
// order by server-side.

export type SongSortField =
  // The backend's own order — what the browse did before it could sort.
  | "default"
  | "addedAt"
  | "alphabetical"
  | "artist"
  | "albumArtist"
  | "album"
  | "year"
  | "duration"
  | "playCount";

export type SongSortType = SortType<SongSortField>;

export const DEFAULT_SONG_SORT: SongSortType = "defaultAsc";

// Sheet row order.
export const SONG_SORT_FIELDS: SongSortField[] = [
  "default",
  "addedAt",
  "alphabetical",
  "artist",
  "albumArtist",
  "album",
  "year",
  "duration",
  "playCount",
];

// Which backends can order the whole library at all. Jellyfin has Items
// SortBy/SortOrder, the local library an ORDER BY, and Navidrome its native
// `/api/song?_sort=` — but plain OpenSubsonic browses through an empty-query
// search3, and the Subsonic spec gives search3 no sort parameter. Sorting there
// would mean crawling the whole library client-side first, so the control is
// hidden instead (same call as the `mostPlayedTracks` capability).
//
// Navidrome's native API needs the JWT taken at login: without it `/api/song`
// answers 401, which would break the browse itself rather than just the sort.
export function songSortFields(
  serverType: ServerType,
  capabilities: Pick<BackendCapabilities, "songAlbumArtist">,
  hasNavidromeNative: boolean,
): SongSortField[] {
  const sortable =
    serverType === "jellyfin" ||
    isIndexBackedType(serverType) ||
    (serverType === "navidrome" && hasNavidromeNative);
  if (!sortable) return [];
  return SONG_SORT_FIELDS.filter(
    (field) => field !== "albumArtist" || capabilities.songAlbumArtist,
  );
}

// What the services receive: `undefined` for the backend's own order, so both
// the request and the react-query key stay exactly what they were before
// sorting existed (JSON.stringify drops undefined values).
export function songSortParam(sort: SongSortType): SongSortType | undefined {
  return parseSortType(sort).field === "default" ? undefined : sort;
}

// The offline fallback holds every downloaded track in one array, so there it
// sorts client-side off the same field names (utils/sort.ts). `addedAt` is
// missing on purpose: a downloaded track carries no library-added date, and
// `default` is the array's incoming (alphabetical) order.
export const OFFLINE_SONG_SORT_FIELDS: SongSortField[] =
  SONG_SORT_FIELDS.filter((field) => field !== "addedAt");

export const SONG_SORT_SPECS: SortFieldSpecs<Child, SongSortField> = {
  default: { value: () => undefined, order: true },
  addedAt: { value: () => undefined, order: true },
  alphabetical: TRACK_SORT_SPECS.alphabetical,
  artist: TRACK_SORT_SPECS.artist,
  albumArtist: TRACK_SORT_SPECS.albumArtist,
  album: TRACK_SORT_SPECS.album,
  year: TRACK_SORT_SPECS.year,
  duration: TRACK_SORT_SPECS.duration,
  playCount: TRACK_SORT_SPECS.playCount,
};
