import {
  folderScopedRequest,
  subsonicRequest,
} from "@/services/openSubsonic/index";
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

export const getNowPlaying = async () =>
  subsonicRequest<{ nowPlaying: NowPlaying }>("/rest/getNowPlaying");

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

export const getStarred = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) =>
  folderScopedRequest<{ starred: Starred }>(
    "/rest/getStarred",
    { musicFolderId },
    { starred: {} },
  );

export const getStarred2 = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) =>
  folderScopedRequest<{ starred2: Starred2 }>(
    "/rest/getStarred2",
    { musicFolderId },
    { starred2: {} },
  );
