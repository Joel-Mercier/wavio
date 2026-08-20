import {
  folderScopedRequest,
  okEnvelope,
  subsonicRequest,
} from "@/services/openSubsonic/index";
import { search3 } from "@/services/openSubsonic/searching";
import type {
  AlbumList,
  AlbumList2,
  NowPlaying,
  Songs,
  Starred,
  Starred2,
} from "@/services/openSubsonic/types";
import type { SongSortType } from "@/utils/songSort";
import type { SortDirection } from "@/utils/sort";

export type AlbumListType =
  | "random"
  | "newest"
  | "highest"
  | "frequent"
  | "recent"
  | "alphabeticalByName"
  | "alphabeticalByArtist"
  | "starred"
  | "byYear"
  | "byGenre";

export const getAlbumList = async (
  type: AlbumListType,
  {
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  }: {
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
) =>
  folderScopedRequest<{ albumList: AlbumList }>(
    "/rest/getAlbumList",
    { type, size, offset, fromYear, toYear, genre, musicFolderId },
    { albumList: {} },
  );

// Bounds wide enough to mean "every album" for a `byYear` browse that is really
// a sort rather than a year filter. Subsonic requires both, and returns reverse
// chronological order when the first is the later of the two — which is the
// only direction control getAlbumList2 has.
//
// "Every album" is as close as the spec allows, not a guarantee: a year sort
// can only be spelled as a year range here, so any album the server can't place
// in one is unreachable in this browse. Navidrome is safe — `min_year`/
// `max_year` are non-null and an untagged album carries 0, which the range
// covers — and it takes the native path for an unbounded byYear anyway
// (services/backend/lists.ts). A server that stores an unknown year as NULL
// would drop those albums, and nothing sendable here would bring them back.
const YEAR_SORT_BOUNDS = { min: 0, max: 9999 };

// `byYear` is the one album-list type whose direction the caller can pick, so
// `order` is folded into the year bounds here. Every other type serves exactly
// one direction (see utils/albumSort.ts, which locks those rows in the sheet).
function yearBounds(
  type: AlbumListType,
  fromYear: number | undefined,
  toYear: number | undefined,
  order: SortDirection | undefined,
): { fromYear?: number; toYear?: number } {
  if (type !== "byYear") return { fromYear, toYear };
  const from = fromYear ?? YEAR_SORT_BOUNDS.min;
  const to = toYear ?? YEAR_SORT_BOUNDS.max;
  const [low, high] = from <= to ? [from, to] : [to, from];
  return order === "desc"
    ? { fromYear: high, toYear: low }
    : { fromYear: low, toYear: high };
}

export const getAlbumList2 = async (
  type: AlbumListType,
  {
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
    order,
  }: {
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
    // Accepted (this is the signature `dispatch` types the whole backend off)
    // but honoured only for `byYear`: the Subsonic spec gives getAlbumList2 no
    // sort-order parameter, so every other type is stuck with the direction it
    // serves. utils/albumSort.ts locks those rows rather than letting the UI
    // promise an order this backend can't produce.
    order?: SortDirection;
  },
) =>
  folderScopedRequest<{ albumList2: AlbumList2 }>(
    "/rest/getAlbumList2",
    {
      type,
      size,
      offset,
      ...yearBounds(type, fromYear, toYear, order),
      genre,
      musicFolderId,
    },
    { albumList2: {} },
  );

// Code 70 here is "nobody is playing anything" on servers that answer an empty
// now-playing list that way — an empty state the UI already renders.
export const getNowPlaying = async () =>
  subsonicRequest<{ nowPlaying: NowPlaying }>(
    "/rest/getNowPlaying",
    {},
    {},
    { notFoundIsExpected: true },
  );

export const getRandomSongs = async ({
  size,
  fromYear,
  toYear,
  genre,
  musicFolderId,
}: {
  size?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) =>
  folderScopedRequest<{ songs: Songs }>(
    "/rest/getRandomSongs",
    { size, fromYear, toYear, genre, musicFolderId },
    { songs: {} },
  );

// The whole library, one page at a time. Subsonic has no "get all songs"
// endpoint: an empty-query search3 is what the spec defines as "everything",
// and it is already what the extended-offline crawl enumerates the library with
// (services/offline/librarySyncService.ts stepSongs). A pre-OpenSubsonic server
// answers error code 10 (required parameter missing) instead.
// A non-empty `query` goes through the same call, so browsing and searching are
// the same paginated request.
// `sort` is accepted (this is the signature `dispatch` types the whole backend
// off) but ignored: search3 takes no sort parameter, so the browse is only
// sortable on the backends that have a real one — see utils/songSort.ts, which
// hides the control here.
export const getSongs = async ({
  query = "",
  size,
  offset,
  musicFolderId,
}: {
  query?: string;
  size?: number;
  offset?: number;
  musicFolderId?: string;
  sort?: SongSortType;
}) => {
  const rsp = await search3(query, {
    songCount: size,
    songOffset: offset,
    albumCount: 0,
    artistCount: 0,
    musicFolderId,
  });
  return okEnvelope<{ songs: Songs }>({
    songs: { song: rsp.searchResult3?.song ?? [] },
  });
};

export const getSongsByGenre = async (
  genre: string,
  {
    count,
    offset,
    musicFolderId,
  }: { count?: number; offset?: number; musicFolderId?: string },
) =>
  folderScopedRequest<{ songs: Songs }>(
    "/rest/getSongsByGenre",
    { genre, count, offset, musicFolderId },
    { songs: {} },
  );

// Favorites are a user-level, server-wide concept — not folder-scoped (mirrors
// Jellyfin/local, which ignore the folder too, and the playlists endpoint).
// Scoping starred items by music folder meant a selected library holding none of
// them silently blanked the Library view (folderScopedRequest swallows Subsonic
// code 70), so musicFolderId is accepted for signature parity but unused.
export const getStarred = async (_params: { musicFolderId?: string } = {}) =>
  subsonicRequest<{ starred: Starred }>("/rest/getStarred");

export const getStarred2 = async (_params: { musicFolderId?: string } = {}) =>
  subsonicRequest<{ starred2: Starred2 }>("/rest/getStarred2");
