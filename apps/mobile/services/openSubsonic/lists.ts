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

export const getAlbumList2 = async (
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
  folderScopedRequest<{ albumList2: AlbumList2 }>(
    "/rest/getAlbumList2",
    { type, size, offset, fromYear, toYear, genre, musicFolderId },
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
