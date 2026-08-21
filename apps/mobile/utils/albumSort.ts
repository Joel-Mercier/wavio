import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import type { ServerType } from "@/stores/servers";
import {
  buildSortType,
  parseSortType,
  type SortDirection,
  type SortFieldSpecs,
  type SortType,
  sortTime,
} from "@/utils/sort";

// Sorting for the whole-library album browse
// (app/(app)/(tabs)/(library)/albums). Like the track browse, this list is
// paginated: only the fetched pages are in memory, so the order has to go into
// the backend call. Unlike it, every backend can order albums — Subsonic's
// getAlbumList2 `type` *is* a sort — so nothing is hidden outright. What
// differs is the *direction*: the Subsonic spec gives getAlbumList2 no sort
// order parameter, so each type serves exactly one direction.

export type AlbumSortField =
  | "alphabetical"
  | "artist"
  | "addedAt"
  | "year"
  | "playCount"
  | "lastPlayed"
  | "rating"
  | "random";

export type AlbumSortType = SortType<AlbumSortField>;

// The order the browse had before it could sort (`type: "alphabeticalByName"`).
export const DEFAULT_ALBUM_SORT: AlbumSortType = "alphabeticalAsc";

// Sheet row order.
export const ALBUM_SORT_FIELDS: AlbumSortField[] = [
  "alphabetical",
  "artist",
  "addedAt",
  "year",
  "playCount",
  "lastPlayed",
  "rating",
  "random",
];

// The Subsonic album-list type each field browses through. Every backend
// implements the same enum (services/jellyfin/lists.ts paramsFor,
// services/local/lists.ts ORDER_FOR_TYPE), so this map is what makes the sort
// protocol-agnostic.
const ALBUM_SORT_TYPE: Record<AlbumSortField, AlbumListType> = {
  alphabetical: "alphabeticalByName",
  artist: "alphabeticalByArtist",
  addedAt: "newest",
  year: "byYear",
  playCount: "frequent",
  lastPlayed: "recent",
  rating: "highest",
  random: "random",
};

// The direction each type serves with no `order` param — and therefore the only
// direction a plain OpenSubsonic server can produce.
const NATURAL_DIRECTION: Record<AlbumSortField, SortDirection> = {
  alphabetical: "asc",
  artist: "asc",
  year: "asc",
  addedAt: "desc",
  playCount: "desc",
  lastPlayed: "desc",
  rating: "desc",
  random: "asc",
};

// Fields whose album-list type only returns rows once the library holds the
// data behind it. On a server where nothing has been played or rated,
// `frequent`, `recent` and `highest` answer with an empty list rather than the
// whole library — Navidrome's Subsonic surface filters `play_count > 0` /
// `play_date IS NOT NULL` / `rating > 0`, and the local backend does the same
// through ALBUM_HAVING_SQL and ratedAlbums(). Offering such a row sends a full
// library to EmptyDisplay, so coverage is probed before the row is offered
// (hooks/useAlbumSort). The browse is paginated, so unlike the artist list and
// the offline album fallback there is nothing in memory to measure it from.
export const ALBUM_SORT_COVERAGE_FIELDS: AlbumSortField[] = [
  "playCount",
  "lastPlayed",
  "rating",
];

export function albumSortListType(field: AlbumSortField): AlbumListType {
  return ALBUM_SORT_TYPE[field];
}

// Unknown coverage keeps the field: the probe settles in one round trip, and a
// row vanishing under the user's finger is worse than one that was never
// offered. A paused (offline) or failed probe reads as unknown too, so a
// server that can't answer never loses rows over it.
export function availableAlbumSortFields(
  coverage: Partial<Record<AlbumSortField, boolean>>,
): AlbumSortField[] {
  return ALBUM_SORT_FIELDS.filter((field) => coverage[field] !== false);
}

// What the browse request — and therefore the react-query key — is built from.
// `order` is left off when the direction is the one the type already serves, so
// a natural-direction browse keeps the exact request and cache key it had
// before this list could be reordered, and only a genuinely reversed browse
// needs a backend that can honour an order (services/backend/lists.ts).
export function albumSortParams(sort: AlbumSortType): {
  type: AlbumListType;
  order?: SortDirection;
} {
  const { field, direction } = parseSortType(sort);
  const type = ALBUM_SORT_TYPE[field];
  return direction === NATURAL_DIRECTION[field]
    ? { type }
    : { type, order: direction };
}

// Whether the backend accepts a sort order at all. Jellyfin has Items
// SortOrder, the local library an ORDER BY direction, and Navidrome its native
// `/api/album?_order=` — but the Subsonic surface has none, so there a field is
// stuck with whatever direction its album-list type happens to serve.
//
// Navidrome's native API needs the JWT taken at login: without it `/api/album`
// answers 401, which would break the browse itself rather than just the order.
export function albumOrderSupported(
  serverType: ServerType,
  hasNavidromeNative: boolean,
): boolean {
  return (
    serverType === "jellyfin" ||
    serverType === "local" ||
    (serverType === "navidrome" && hasNavidromeNative)
  );
}

// Fields the sort sheet must not let the user flip, so a row never promises an
// order the backend won't serve. `random` is direction-less everywhere; on a
// backend with no order param everything else is pinned to its natural
// direction except `year`, which reverses by swapping fromYear/toYear (see
// services/openSubsonic/lists.ts).
export function albumLockedDirections(
  serverType: ServerType,
  hasNavidromeNative: boolean,
): Partial<Record<AlbumSortField, SortDirection | "none">> {
  const locked: Partial<Record<AlbumSortField, SortDirection | "none">> = {
    random: "none",
  };
  if (albumOrderSupported(serverType, hasNavidromeNative)) return locked;
  for (const field of ALBUM_SORT_FIELDS) {
    if (field !== "year" && field !== "random") {
      locked[field] = NATURAL_DIRECTION[field];
    }
  }
  return locked;
}

// The sort to persist when a row is tapped: a locked field always resolves to
// its allowed direction rather than to the sheet's toggle.
export function resolveAlbumSort(
  next: AlbumSortType,
  locked: Partial<Record<AlbumSortField, SortDirection | "none">>,
): AlbumSortType {
  const { field } = parseSortType(next);
  const lock = locked[field];
  if (!lock) return next;
  return buildSortType(
    field,
    lock === "none" ? NATURAL_DIRECTION[field] : lock,
  );
}

const albumName = (album: AlbumID3) => album.sortName || album.name;

// The offline fallback holds every downloaded album in one array, so there the
// same fields sort client-side (utils/sort.ts) off whatever the collection
// carries. `random` is missing on purpose: it is a backend order, not a value
// read off the items.
export const ALBUM_SORT_SPECS: SortFieldSpecs<AlbumID3, AlbumSortField> = {
  alphabetical: { value: albumName, always: true },
  artist: {
    value: (album) => album.displayArtist || album.artist,
    tiebreakers: [(album) => album.year, albumName],
  },
  addedAt: { value: (album) => sortTime(album.created) },
  year: { value: (album) => album.year, tiebreakers: [albumName] },
  playCount: { value: (album) => album.playCount, zeroIsEmpty: true },
  lastPlayed: { value: (album) => sortTime(album.played) },
  rating: { value: (album) => album.userRating, zeroIsEmpty: true },
  random: { value: () => undefined, order: true },
};

export const OFFLINE_ALBUM_SORT_FIELDS: AlbumSortField[] =
  ALBUM_SORT_FIELDS.filter((field) => field !== "random");
